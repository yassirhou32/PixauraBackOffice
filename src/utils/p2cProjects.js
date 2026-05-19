const { isRequestFullDay, FULL_DAY_SLOT_ID } = require("../constants/timeSlots");
const { P2C_COUNTING_STATUSES, getP2cMonthState } = require("./p2cQuota");

function toDateKey(d) {
  if (!d) return "";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function requestToFormSnapshot(doc) {
  if (!doc) return null;
  const fullDay = isRequestFullDay(doc);
  return {
    company: doc.company || "",
    mainContact: doc.mainContact || "",
    email: doc.email || "",
    phone: doc.phone || "",
    communicationAxis: doc.communicationAxis || "commercial",
    projectDetails: doc.projectDetails || "",
    shootingAddress: doc.shootingAddress || "",
    technicalConstraints: doc.technicalConstraints || "",
    onsiteContact: doc.onsiteContact || "",
    freeComment: doc.freeComment || "",
    requestedDate: toDateKey(doc.requestedDate),
    timeSlotId: fullDay ? FULL_DAY_SLOT_ID : doc.timeSlotId || "",
  };
}

/** Associe un numéro de projet aux demandes du mois (rétrocompat sans p2cSlot). */
function withResolvedSlots(active) {
  const sorted = [...(active || [])].sort(
    (a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0)
  );
  return sorted.map((doc, index) => ({
    doc,
    slot: doc.p2cSlot === 1 || doc.p2cSlot === 2 ? doc.p2cSlot : index === 0 ? 1 : index === 1 ? 2 : null,
  }));
}

function getProjectRequest(active, slot) {
  const entry = withResolvedSlots(active).find((x) => x.slot === slot);
  return entry?.doc || null;
}

/** Inclut P1/P2 du cycle en cours même si la date de tournage est hors filtre mois (rétrocompat). */
function mergeP2cWorkflowRequests(monthRequests, allActive) {
  const month = [...(monthRequests || [])];
  const ids = new Set(month.map((r) => String(r._id)));
  const p1 = getProjectRequest(allActive, 1);
  const p2 = getProjectRequest(allActive, 2);
  if (p1 && !ids.has(String(p1._id))) month.push(p1);
  if (p2 && !ids.has(String(p2._id))) month.push(p2);
  return month;
}

function buildP2cStatusPayload(clientMonthRequests, excludeRequestId) {
  const active = clientMonthRequests || [];
  const p2c = getP2cMonthState(active, excludeRequestId);
  const project1 = getProjectRequest(active, 1);
  const project2 = getProjectRequest(active, 2);

  const prefillFromProject1 = project1
    ? {
        company: project1.company || "",
        mainContact: project1.mainContact || "",
        email: project1.email || "",
        phone: project1.phone || "",
        communicationAxis: project1.communicationAxis || "commercial",
        projectDetails: project1.projectDetails || "",
        shootingAddress: project1.shootingAddress || "",
        technicalConstraints: project1.technicalConstraints || "",
        onsiteContact: project1.onsiteContact || "",
        freeComment: project1.freeComment || "",
        requestedDate: "",
        /** Repris pour le P2 : même créneau si libre sur la nouvelle date */
        timeSlotId: isRequestFullDay(project1) ? "" : project1.timeSlotId || "",
      }
    : null;

  return {
    p2c,
    project1: {
      submitted: Boolean(project1),
      requestId: project1 ? String(project1._id) : null,
      editable:
        project1 && ["en_attente", "a_completer"].includes(project1.status),
      isFullDay: project1 ? isRequestFullDay(project1) : false,
    },
    project2: {
      submitted: Boolean(project2),
      requestId: project2 ? String(project2._id) : null,
      editable:
        project2 && ["en_attente", "a_completer"].includes(project2.status),
      isFullDay: project2 ? isRequestFullDay(project2) : false,
    },
    canOpenProject1: !project1 || (excludeRequestId && project1 && String(project1._id) === String(excludeRequestId)),
    canOpenProject2:
      Boolean(project1) &&
      (!project2 || (excludeRequestId && project2 && String(project2._id) === String(excludeRequestId))),
    prefillFromProject1,
    /** Formulaire Projet 1 figé côté client (tous champs, y compris date) */
    lockedProject1: requestToFormSnapshot(project1),
    lockedProject2: requestToFormSnapshot(project2),
  };
}

function validateP2cSlotRules({ p2cSlot, clientMonthRequests, excludeRequestId, isFullDay }) {
  const slot = Number(p2cSlot);
  if (slot !== 1 && slot !== 2) {
    return { ok: false, message: "Projet P2C invalide (1 ou 2)." };
  }

  if (isFullDay && slot !== 1) {
    return {
      ok: false,
      message: "La journee complete est reservee au formulaire Projet 1.",
    };
  }

  const active = (clientMonthRequests || []).filter((r) =>
    P2C_COUNTING_STATUSES.includes(r.status)
  );
  const p1 = getProjectRequest(active, 1);
  const p2 = getProjectRequest(active, 2);

  if (slot === 1 && p1 && String(p1._id) !== String(excludeRequestId || "")) {
    return {
      ok: false,
      message: "Le Projet 1 est deja envoye ce mois. Utilisez le formulaire Projet 2.",
    };
  }

  if (slot === 2 && !p1) {
    return {
      ok: false,
      message: "Completez d'abord le formulaire Projet 1 avant le Projet 2.",
    };
  }

  if (slot === 2 && p2 && String(p2._id) !== String(excludeRequestId || "")) {
    return {
      ok: false,
      message: "Le Projet 2 est deja envoye ce mois.",
    };
  }

  if (slot === 2 && p1 && isRequestFullDay(p1) && String(p1._id) !== String(excludeRequestId || "")) {
    return {
      ok: false,
      message:
        "Vous avez reserve une journee complete au Projet 1 : le Projet 2 n'est pas disponible ce mois.",
    };
  }

  return { ok: true };
}

module.exports = {
  withResolvedSlots,
  getProjectRequest,
  mergeP2cWorkflowRequests,
  buildP2cStatusPayload,
  validateP2cSlotRules,
};
