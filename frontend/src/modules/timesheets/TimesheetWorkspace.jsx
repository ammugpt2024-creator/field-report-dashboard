import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../services/supabase";
import {
  LOCKED_TIME_CARD_STATUSES,
  TIME_CARD_STATUS,
  createTimeCard,
  deleteTimeCard,
  findFiledCardForWeek,
  getTimeCardCollections,
  getTimeCards,
  normalizeWeeklyCard,
  saveTimeCard
} from "../../services/timeCardService";
import { openTimeCardPdf, regenerateTimeCardPdf } from "../../services/timeCardPdfService";
import { fetchTimesheetStatusUpdates, fetchTimesheetsForTechnician } from "../../services/timesheetSyncService";
import { TimeCardEditor, TimeCardReadOnlyView, TimeCardsPage } from "./timesheetUi";

// Role-neutral timesheet workspace: every employee (technician, manager, QC,
// admin) files their own weekly timesheet here, and approval routes to the
// manager of each project on the sheet. Mounted at /timesheets.
export default function TimesheetWorkspace() {
  const { profile } = useAuth();
  const [projects, setProjects] = useState([]);
  const [timeCards, setTimeCards] = useState([]);
  const [activeTimeCard, setActiveTimeCard] = useState(null);
  const [view, setView] = useState("list");

  const isOfficeEmployee = Boolean(
    profile?.overtime_exempt ||
    String(profile?.employment_type || "").toLowerCase().includes("office") ||
    String(profile?.role || "").toLowerCase().includes("office")
  );

  useEffect(() => {
    async function loadProjects() {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .order("project_name", { ascending: true });
      if (error) {
        console.warn("Projects could not be loaded for the timesheet workspace.", error);
        return;
      }
      setProjects(data || []);
    }
    loadProjects();
  }, []);

  const projectOptions = useMemo(() => (
    (projects || [])
      .filter((project) => String(project.status || "Active").toLowerCase() === "active")
      .map((project) => ({
        id: project.id,
        name: project.project_name || project.name || `Project ${project.id}`,
        number: project.project_number || String(project.id),
        location: project.project_location || project.location || "",
        overtimeExempt: Boolean(project.overtime_exempt)
      }))
  ), [projects]);

  useEffect(() => {
    setTimeCards(getTimeCards());

    // Restore timesheets submitted from other devices and merge manager
    // approval/return decisions into the local copies (same pattern as the
    // technician workspace).
    async function syncFromDatabase() {
      let changed = false;
      const technicianName = profile?.full_name || "";
      if (technicianName) {
        const remoteCards = await fetchTimesheetsForTechnician(technicianName);
        const localIds = new Set(getTimeCards().map((card) => String(card.id)));
        remoteCards.forEach((remoteCard) => {
          if (localIds.has(String(remoteCard.id))) return;
          changed = true;
          saveTimeCard(remoteCard);
        });
      }
      const syncableIds = getTimeCards()
        .filter((card) => card.status !== TIME_CARD_STATUS.DRAFT)
        .map((card) => String(card.id));
      if (syncableIds.length) {
        const updates = await fetchTimesheetStatusUpdates(syncableIds);
        updates.forEach((update) => {
          const local = getTimeCards().find((card) => String(card.id) === String(update.id));
          if (!local || local.status === update.status) return;
          changed = true;
          saveTimeCard({
            ...local,
            status: update.status,
            reviewedBy: update.reviewed_by || local.reviewedBy || "",
            reviewed_by: update.reviewed_by || local.reviewed_by || "",
            reviewedAt: update.reviewed_at || local.reviewedAt || "",
            reviewed_at: update.reviewed_at || local.reviewed_at || "",
            ...(update.status === TIME_CARD_STATUS.APPROVED ? { approvedAt: update.reviewed_at, approved_at: update.reviewed_at } : {}),
            ...(update.status === TIME_CARD_STATUS.RETURNED ? { returnedAt: update.reviewed_at, returned_at: update.reviewed_at, managerComment: update.manager_comment || "", reviewComments: update.manager_comment || "", review_comments: update.manager_comment || "" } : {})
          });
        });
      }
      if (changed) setTimeCards(getTimeCards());
    }
    syncFromDatabase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const timeCardCollections = useMemo(() => getTimeCardCollections(timeCards), [timeCards]);

  function refreshTimeCards(nextCard) {
    const cards = getTimeCards();
    setTimeCards(cards);
    if (nextCard) setActiveTimeCard(nextCard);
  }

  function buildCardTemplate() {
    const defaultProject = projectOptions[0] || {};
    return createTimeCard({
      projectName: defaultProject.name || "",
      projectId: defaultProject.id || "",
      projectNumber: defaultProject.number || String(defaultProject.id || ""),
      projectLocation: defaultProject.location || "",
      companyId: profile?.company_id || profile?.organization_id || "",
      technicianName: profile?.full_name || "Employee"
    });
  }

  function createNewTimeCard() {
    const draftCard = buildCardTemplate();
    // One timesheet per employee per week — reopen this week's editable card if one exists.
    const weekStart = draftCard.weekStartDate || draftCard.week_start_date || draftCard.date;
    const cardsForWeek = getTimeCards()
      .filter((card) => (card.weekStartDate || card.week_start_date || card.date) === weekStart)
      .sort((left, right) => new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0));
    const editableCard = cardsForWeek.find((card) =>
      [TIME_CARD_STATUS.DRAFT, TIME_CARD_STATUS.REJECTED, TIME_CARD_STATUS.RETURNED].includes(card.status)
    );
    // Never start a second timesheet for a week that is already filed — open
    // the submitted/approved copy read-only instead.
    const lockedCard = cardsForWeek.find((card) =>
      [TIME_CARD_STATUS.SUBMITTED, TIME_CARD_STATUS.PENDING_REVIEW, TIME_CARD_STATUS.APPROVED, TIME_CARD_STATUS.COMPLETED].includes(card.status)
    );
    const card = editableCard || (lockedCard ? null : saveTimeCard(draftCard));
    refreshTimeCards(card || lockedCard);
    setView("card");
  }

  function openTimeCard(card) {
    // A leftover duplicate draft for an already-filed week opens the filed
    // copy instead of an editor the employee could fill in again.
    if (!LOCKED_TIME_CARD_STATUSES.includes(card.status)) {
      const filedCard = findFiledCardForWeek(card);
      if (filedCard) {
        window.alert(`This week already has a ${filedCard.status === TIME_CARD_STATUS.APPROVED || filedCard.status === TIME_CARD_STATUS.COMPLETED ? "approved" : "submitted"} timesheet. Opening it instead — you can delete the duplicate draft from the Drafts tab.`);
        setActiveTimeCard(filedCard);
        setView("card");
        return;
      }
    }
    setActiveTimeCard(card);
    setView("card");
  }

  function navigateTimeCardWeek(card, direction) {
    const currentWeekStart = card.weekStartDate || card.week_start_date || card.date;
    const parsed = new Date(`${currentWeekStart}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return;
    parsed.setDate(parsed.getDate() + direction * 7);
    const targetWeekStart = [
      parsed.getFullYear(),
      String(parsed.getMonth() + 1).padStart(2, "0"),
      String(parsed.getDate()).padStart(2, "0")
    ].join("-");
    const cardsForWeek = getTimeCards()
      .filter((item) => (item.weekStartDate || item.week_start_date || item.date) === targetWeekStart)
      .sort((left, right) => new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0));
    // A filed week always opens its filed copy — an editable leftover for the
    // same week must not shadow it.
    const existingCard = cardsForWeek.find((item) => LOCKED_TIME_CARD_STATUSES.includes(item.status))
      || cardsForWeek.find((item) =>
        [TIME_CARD_STATUS.DRAFT, TIME_CARD_STATUS.REJECTED, TIME_CARD_STATUS.RETURNED].includes(item.status)
      )
      || cardsForWeek[0];
    if (existingCard) {
      setActiveTimeCard(existingCard);
      return;
    }
    // Unsaved template for the target week — persisted only once edited.
    setActiveTimeCard(normalizeWeeklyCard({
      ...buildCardTemplate(),
      date: targetWeekStart,
      weekStartDate: targetWeekStart,
      week_start_date: targetWeekStart
    }));
  }

  function removeTimeCard(card) {
    if (card.status !== TIME_CARD_STATUS.DRAFT) return;
    if (!window.confirm("Delete this draft Timesheet?")) return;
    deleteTimeCard(card.id);
    const cards = getTimeCards();
    setTimeCards(cards);
    setActiveTimeCard(null);
    setView("list");
  }

  function recallTimeCard(card) {
    // Only an undecided submission can be recalled — never an approved sheet.
    if (![TIME_CARD_STATUS.SUBMITTED, TIME_CARD_STATUS.PENDING_REVIEW].includes(card.status)) return;
    const recalled = saveTimeCard({
      ...card,
      status: TIME_CARD_STATUS.DRAFT,
      submittedAt: "",
      updatedAt: new Date().toISOString()
    });
    refreshTimeCards(recalled);
  }

  async function viewTimeCardPdf(card) {
    try {
      await openTimeCardPdf(card, { download: false });
    } catch (error) {
      window.alert(error.message || "PDF is still being generated. Please try again in a few seconds.");
    }
  }

  async function downloadTimeCardPdf(card) {
    try {
      await openTimeCardPdf(card, { download: true });
    } catch (error) {
      window.alert(error.message || "PDF is still being generated. Please try again in a few seconds.");
    }
  }

  async function regenerateTimesheetPdf(card) {
    const withPdf = await regenerateTimeCardPdf(card);
    refreshTimeCards(withPdf);
    if ((withPdf.pdfGenerationStatus || withPdf.pdf_generation_status) === "failed") {
      window.alert("Unable to generate Timesheet PDF. Please click Regenerate PDF or contact support.");
    }
  }

  const selectedTimeCard = activeTimeCard;
  const isTimeCardReadOnly = selectedTimeCard && [
    TIME_CARD_STATUS.SUBMITTED,
    TIME_CARD_STATUS.PENDING_REVIEW,
    TIME_CARD_STATUS.APPROVED,
    TIME_CARD_STATUS.COMPLETED
  ].includes(selectedTimeCard.status);

  return (
    <div className="space-y-4">
      {view === "card" && selectedTimeCard ? (
        <>
          <button
            type="button"
            onClick={() => setView("list")}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" /> All timesheets
          </button>
          {isTimeCardReadOnly ? (
            <TimeCardReadOnlyView
              card={selectedTimeCard}
              onRecall={() => recallTimeCard(selectedTimeCard)}
              onViewPdf={() => viewTimeCardPdf(selectedTimeCard)}
              onDownloadPdf={() => downloadTimeCardPdf(selectedTimeCard)}
              onRegeneratePdf={() => regenerateTimesheetPdf(selectedTimeCard)}
              onNavigateWeek={(direction) => navigateTimeCardWeek(selectedTimeCard, direction)}
            />
          ) : (
            <TimeCardEditor
              card={Boolean(selectedTimeCard.overtimeExempt || selectedTimeCard.overtime_exempt) !== isOfficeEmployee
                ? normalizeWeeklyCard({ ...selectedTimeCard, overtimeExempt: isOfficeEmployee, overtime_exempt: isOfficeEmployee })
                : selectedTimeCard}
              onChange={refreshTimeCards}
              onSubmit={refreshTimeCards}
              onDelete={() => removeTimeCard(selectedTimeCard)}
              onCancel={() => setView("list")}
              onNavigateWeek={(direction) => navigateTimeCardWeek(selectedTimeCard, direction)}
              assignedProjects={projectOptions}
            />
          )}
        </>
      ) : (
        <TimeCardsPage
          timeCardCollections={timeCardCollections}
          initialTab="draft"
          onCreateTimeCard={createNewTimeCard}
          onOpenTimeCard={openTimeCard}
          onDeleteTimeCard={removeTimeCard}
          onRecallTimeCard={recallTimeCard}
          onDownloadTimeCardPdf={downloadTimeCardPdf}
        />
      )}
    </div>
  );
}
