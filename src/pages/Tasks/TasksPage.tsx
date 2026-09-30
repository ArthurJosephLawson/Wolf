/** Tasks screen: filter, sort, search, create, edit, complete, delete. */
import { useEffect, useMemo, useState } from "react";
import { Panel, ErrorNote } from "../../components/common/ui";
import { Segmented } from "../../components/common/Segmented";
import { TaskList } from "../../components/Tasks/TaskList";
import { TaskFormDialog } from "../../components/Tasks/TaskFormDialog";
import {
  useTaskStore,
  selectVisibleTasks,
  selectTaskCounts,
} from "../../stores/taskStore";
import { useWolfStore } from "../../stores/wolfStore";
import type {
  NewTask,
  Task,
  TaskFilter,
  TaskSort,
  TaskUpdate,
} from "../../types";

const FILTERS: readonly { value: TaskFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Open" },
  { value: "today", label: "Today" },
  { value: "overdue", label: "Overdue" },
  { value: "completed", label: "Done" },
];

const SORTS: readonly { value: TaskSort; label: string }[] = [
  { value: "default", label: "Smart" },
  { value: "dueDate", label: "Due" },
  { value: "priority", label: "Priority" },
  { value: "alphabetical", label: "A–Z" },
  { value: "created", label: "Newest" },
];

export function TasksPage() {
  const store = useTaskStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);

  useEffect(() => {
    void store.load();
    // Mount only: the store is a singleton and reloads itself on mutation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = useMemo(() => selectVisibleTasks(store), [store]);
  const counts = useMemo(() => selectTaskCounts(store), [store]);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (task: Task) => {
    setEditing(task);
    setDialogOpen(true);
  };

  const handleToggle = async (task: Task) => {
    const next = !task.completed;
    const ok = await store.setCompleted(task.id, next);
    if (ok) {
      useWolfStore.getState().pushShared(next ? "task-completed" : "default");
    }
  };

  const handleSubmit = async (value: NewTask): Promise<boolean> => {
    if (editing) {
      const update: TaskUpdate = value;
      const ok = await store.update(editing.id, update);
      if (ok) useWolfStore.getState().pushShared("default");
      return ok;
    }
    const created = await store.create(value);
    if (created) {
      useWolfStore.getState().pushShared("task-created");
      return true;
    }
    return false;
  };

  const handleDelete = async () => {
    if (!editing) return;
    const ok = await store.remove(editing.id);
    if (ok) setDialogOpen(false);
  };

  return (
    <>
      <Panel
        title="Tasks"
        actions={
          <button
            type="button"
            className="btn btn--primary btn--small"
            onClick={openCreate}
          >
            + New task
          </button>
        }
      >
        <div className="row" style={{ marginBottom: 8 }}>
          <Segmented
            label="Filter tasks"
            value={store.filter}
            options={FILTERS}
            onChange={store.setFilter}
          />
        </div>
        <div className="row" style={{ marginBottom: 8 }}>
          <label className="visually-hidden" htmlFor="task-sort">
            Sort tasks
          </label>
          <select
            id="task-sort"
            className="select"
            style={{ width: "auto" }}
            value={store.sort}
            onChange={(event) => store.setSort(event.target.value as TaskSort)}
          >
            {SORTS.map((sort) => (
              <option key={sort.value} value={sort.value}>
                Sort: {sort.label}
              </option>
            ))}
          </select>

          <label className="visually-hidden" htmlFor="task-search">
            Search tasks
          </label>
          <input
            id="task-search"
            className="input"
            style={{ width: "auto", flex: 1, minWidth: 120 }}
            placeholder="Search title or notes…"
            value={store.search}
            onChange={(event) => store.setSearch(event.target.value)}
            type="search"
          />
        </div>

        <p className="faint" style={{ marginBottom: 6 }} aria-live="polite">
          {counts.open} open · {counts.done} done
          {counts.today > 0 ? ` · ${counts.today} due today` : ""}
          {counts.overdue > 0 ? ` · ${counts.overdue} overdue` : ""}
        </p>

        <ErrorNote message={store.error} onDismiss={store.clearError} />

        {store.loading && store.tasks.length === 0 ? (
          <p className="empty">Loading tasks…</p>
        ) : (
          <TaskList
            tasks={visible}
            onToggle={handleToggle}
            onEdit={openEdit}
            emptyMessage={
              store.search
                ? "Nothing matches that search."
                : store.filter === "overdue"
                  ? "Nothing overdue. Wolf is pleased."
                  : "No tasks here yet. Add one to get going."
            }
          />
        )}
      </Panel>

      {dialogOpen ? (
        <TaskFormDialog
          open
          task={editing}
          onClose={() => setDialogOpen(false)}
          onSubmit={handleSubmit}
          onDelete={editing ? handleDelete : undefined}
        />
      ) : null}
    </>
  );
}
