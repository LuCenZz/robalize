export interface RawRow {
  [columnName: string]: string;
}

export interface PhaseSegment {
  id: string;
  phaseName: string;
  color: string;
  startDate: Date;
  endDate: Date;
}

export interface EpicTask {
  id: number;
  epicKey: string;
  epicName: string;
  status: string;
  phases: PhaseSegment[];
  rawData: RawRow;
}

export interface ActiveFilter {
  column: string;
  values: string[];
}

export const PHASE_CONFIG = [
  {
    name: "Analysis",
    color: "#ffd43b",
    startCol: "Custom field (Analysis Start Date)",
    endCol: "Custom field (Analysis End Date)",
  },
  {
    name: "Development",
    color: "#ff922b",
    startCol: "Custom field (Development Start Date)",
    endCol: "Custom field (Development End Date)",
  },
  {
    name: "QA / Test",
    color: "#51cf66",
    startCol: "Custom field (QA Start Date)",
    endCol: "Custom field (QA End Date)",
  },
  {
    name: "Customer UAT",
    color: "#339af0",
    startCol: "Custom field (Customer UAT Start Date)",
    endCol: "Custom field (Customer UAT End Date)",
  },
  {
    name: "Pilot",
    color: "#1864ab",
    startCol: "Custom field (Pilot Start Date)",
    endCol: "Custom field (Pilot End Date)",
  },
] as const;
