import { TaskStatus } from 'src/tasks/entities/task.entity';

/**
 * Poids d'avancement de chaque statut, en pourcentage.
 *
 * La progression ne se limite pas aux tâches terminées : une tâche démarrée ou
 * en relecture représente du travail réel. « En révision » vaut 75 % — jamais
 * 100 % : une tâche en relecture n'est pas livrée.
 *
 * Les tâches bloquées comptent dans le total mais n'apportent rien : la
 * progression stagne visiblement tant que le blocage dure.
 */
export const TASK_PROGRESS_WEIGHTS: Record<TaskStatus, number> = {
  [TaskStatus.TODO]: 0,
  [TaskStatus.IN_PROGRESS]: 40,
  [TaskStatus.REVIEW]: 75,
  [TaskStatus.DONE]: 100,
  [TaskStatus.BLOCKED]: 0,
};

/** Progression pondérée d'un ensemble de tâches, arrondie au pourcent. */
export function computeTaskProgress(
  tasks: { status: TaskStatus }[] | null | undefined,
): number {
  if (!tasks?.length) return 0;

  const total = tasks.reduce(
    (sum, task) => sum + (TASK_PROGRESS_WEIGHTS[task.status] ?? 0),
    0,
  );

  return Math.round(total / tasks.length);
}
