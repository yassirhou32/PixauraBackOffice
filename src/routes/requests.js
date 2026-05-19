const express = require("express");
const dayjs = require("dayjs");
const Request = require("../models/Request");
const Client = require("../models/Client");
const { authRequired, roleRequired } = require("../middleware/auth");
const {
  CLIENT_EDITABLE_STATUSES,
  validateClientRequestBooking,
} = require("../utils/requestBooking");
const { buildP2cStatusPayload, mergeP2cWorkflowRequests } = require("../utils/p2cProjects");
const { monthBounds, P2C_COUNTING_STATUSES } = require("../utils/p2cQuota");
const { sendRequestValidatedEmail } = require("../utils/mailer");

const router = express.Router();

router.get("/", authRequired, roleRequired("admin"), async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.clientId) filter.client = req.query.clientId;

  if (req.query.from || req.query.to) {
    filter.requestedDate = {};
    if (req.query.from) filter.requestedDate.$gte = dayjs(req.query.from).startOf("day").toDate();
    if (req.query.to) filter.requestedDate.$lte = dayjs(req.query.to).endOf("day").toDate();
  }

  const sortSpec = req.query.from && req.query.to ? { requestedDate: 1, requestedTime: 1 } : { createdAt: -1 };
  const requests = await Request.find(filter).populate("client").sort(sortSpec);

  const byType = req.query.clientType
    ? requests.filter((r) => r.client?.clientType === req.query.clientType)
    : requests;

  res.json(byType);
});

router.get("/me", authRequired, roleRequired("client"), async (req, res) => {
  const requests = await Request.find({ client: req.user.clientId }).sort({ createdAt: -1 });
  res.json(requests);
});

router.get("/p2c-status", authRequired, roleRequired("client"), async (req, res) => {
  const month = Number(req.query.month || dayjs().month() + 1);
  const year = Number(req.query.year || dayjs().year());
  const { monthStart, monthEnd } = monthBounds(month, year);
  const excludeRequestId = req.query.excludeRequestId
    ? String(req.query.excludeRequestId)
    : undefined;

  const selectFields =
    "_id requestedDate status isFullDay timeSlotId p2cSlot createdAt company mainContact email phone communicationAxis projectDetails shootingAddress technicalConstraints onsiteContact freeComment";

  const clientMonthRequests = await Request.find({
    client: req.user.clientId,
    requestedDate: { $gte: monthStart, $lte: monthEnd },
    status: { $in: P2C_COUNTING_STATUSES },
  })
    .sort({ createdAt: 1 })
    .select(selectFields);

  const allActive = await Request.find({
    client: req.user.clientId,
    status: { $in: P2C_COUNTING_STATUSES },
  })
    .sort({ createdAt: 1 })
    .select(selectFields);

  const merged = mergeP2cWorkflowRequests(clientMonthRequests, allActive);

  res.json({
    month,
    year,
    ...buildP2cStatusPayload(merged, excludeRequestId),
  });
});

router.get("/:id", authRequired, async (req, res) => {
  const request = await Request.findById(req.params.id).populate("client");
  if (!request) return res.status(404).json({ message: "Demande introuvable" });

  if (req.user.role === "client" && String(request.client._id) !== String(req.user.clientId)) {
    return res.status(403).json({ message: "Acces refuse" });
  }

  res.json(request);
});

router.post("/", authRequired, roleRequired("client"), async (req, res) => {
  const client = await Client.findById(req.user.clientId);
  if (!client) return res.status(404).json({ message: "Client introuvable" });

  const check = await validateClientRequestBooking({ client, body: req.body });
  if (!check.ok) return res.status(check.status).json({ message: check.message });

  const created = await Request.create({
    company: String(req.body.company || client.companyName).trim(),
    mainContact: String(req.body.mainContact).trim(),
    email: String(req.body.email || client.email).trim(),
    phone: String(req.body.phone).trim(),
    communicationAxis: req.body.communicationAxis,
    projectDetails: String(req.body.projectDetails).trim(),
    requestedDate: check.requestedDate,
    requestedTime: check.requestedTime,
    timeSlotId: check.timeSlotId,
    isFullDay: Boolean(check.isFullDay),
    shootingAddress: String(req.body.shootingAddress).trim(),
    technicalConstraints: String(req.body.technicalConstraints).trim(),
    onsiteContact: String(req.body.onsiteContact).trim(),
    freeComment: String(req.body.freeComment || "").trim(),
    p2cSlot: check.p2cSlot,
    client: client._id,
  });

  res.status(201).json(created);
});

const STATUS_ENUM = ["en_attente", "validee", "refusee", "a_completer"];

router.patch("/:id/status", authRequired, roleRequired("admin"), async (req, res) => {
  const nextStatus = String(req.body.status || "").trim();
  if (!STATUS_ENUM.includes(nextStatus)) {
    return res.status(400).json({ message: "Statut invalide." });
  }

  const existing = await Request.findById(req.params.id).populate("client", "email companyName");
  if (!existing) return res.status(404).json({ message: "Demande introuvable" });

  const previousStatus = existing.status;
  existing.status = nextStatus;
  await existing.save();

  let emailStatus;
  if (nextStatus === "validee" && previousStatus !== "validee") {
    const to = String(existing.email || existing.client?.email || "").trim();
    emailStatus = to
      ? await sendRequestValidatedEmail({
          to,
          company: existing.company || existing.client?.companyName,
          requestedDate: existing.requestedDate,
          timeSlotId: existing.timeSlotId,
          isFullDay: existing.isFullDay,
          requestedTime: existing.requestedTime,
          p2cSlot: existing.p2cSlot,
        })
      : { sent: false, reason: "Adresse email manquante" };
  }

  const payload = existing.toObject();
  if (emailStatus) payload.emailStatus = emailStatus;
  res.json(payload);
});

router.patch("/:id", authRequired, roleRequired("client"), async (req, res) => {
  const existing = await Request.findById(req.params.id);
  if (!existing) return res.status(404).json({ message: "Demande introuvable" });
  if (String(existing.client) !== String(req.user.clientId)) {
    return res.status(403).json({ message: "Acces refuse" });
  }
  if (!CLIENT_EDITABLE_STATUSES.includes(existing.status)) {
    return res.status(400).json({
      message: "Cette demande ne peut plus etre modifiee (statut valide ou refuse).",
    });
  }

  const client = await Client.findById(req.user.clientId);
  if (!client) return res.status(404).json({ message: "Client introuvable" });

  const body = {
    company: req.body.company ?? existing.company,
    mainContact: req.body.mainContact ?? existing.mainContact,
    email: req.body.email ?? existing.email,
    phone: req.body.phone ?? existing.phone,
    communicationAxis: req.body.communicationAxis ?? existing.communicationAxis,
    projectDetails: req.body.projectDetails ?? existing.projectDetails,
    requestedDate: req.body.requestedDate ?? existing.requestedDate,
    timeSlotId: req.body.timeSlotId ?? existing.timeSlotId,
    shootingAddress: req.body.shootingAddress ?? existing.shootingAddress,
    technicalConstraints: req.body.technicalConstraints ?? existing.technicalConstraints,
    onsiteContact: req.body.onsiteContact ?? existing.onsiteContact,
    freeComment: req.body.freeComment ?? existing.freeComment,
    p2cSlot: req.body.p2cSlot ?? existing.p2cSlot ?? 1,
  };

  const check = await validateClientRequestBooking({
    client,
    body,
    excludeRequestId: String(existing._id),
  });
  if (!check.ok) return res.status(check.status).json({ message: check.message });

  existing.company = body.company;
  existing.mainContact = body.mainContact;
  existing.email = body.email;
  existing.phone = body.phone;
  existing.communicationAxis = body.communicationAxis;
  existing.projectDetails = body.projectDetails;
  existing.requestedDate = check.requestedDate;
  existing.requestedTime = check.requestedTime;
  existing.timeSlotId = check.timeSlotId;
  existing.isFullDay = Boolean(check.isFullDay);
  existing.p2cSlot = check.p2cSlot;
  existing.shootingAddress = body.shootingAddress;
  existing.technicalConstraints = body.technicalConstraints;
  existing.onsiteContact = body.onsiteContact;
  existing.freeComment = body.freeComment;

  await existing.save();
  res.json(existing);
});

module.exports = router;
