/** Tipos del modo sin conexión, compartidos con el cliente (solo tipos: sin código de servidor). */

export type OTask = {
  id: string;
  title: string;
  status: string;
  priority: number;
  dueDate: string | null;
  dueTime: string | null;
  projectId: string | null;
  spaceId: string;
  parentTaskId: string | null;
  estimateMinutes: number | null;
  description: string | null;
  updatedAt: string;
};
export type ONote = { id: string; title: string; folderPath: string | null; pinned: boolean; bodyMd: string; truncated: boolean; updatedAt: string };
export type OInbox = { id: string; text: string; suggestedType: string | null; createdAt: string; updatedAt: string };
export type OProject = {
  id: string;
  name: string;
  status: string;
  clientId: string | null;
  nextAction: string | null;
  progress: number;
  targetDate: string | null;
  updatedAt: string;
};
export type OClient = {
  id: string;
  name: string;
  status: string;
  industry: string | null;
  city: string | null;
  website: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  updatedAt: string;
};
export type OSpace = { id: string; name: string; color: string };

export type OfflineSnapshot = {
  serverTime: string;
  full: boolean;
  tasks: OTask[];
  notes: ONote[];
  inbox: OInbox[];
  projects: OProject[];
  clients: OClient[];
  spaces: OSpace[];
  removed: { task: string[]; note: string[]; inbox: string[]; project: string[]; client: string[] };
};

export type PushResult = {
  id: string;
  status: "applied" | "conflict" | "rejected" | "retry";
  message?: string;
  entityId?: string;
  duplicate?: boolean;
};
