import { create } from 'zustand';

interface IntelligenceState {
  selectedAccountId: string | null;
  dateRange: string;
  isAiDiagnosticRunning: boolean;
  setSelectedAccountId: (id: string | null) => void;
  setDateRange: (range: string) => void;
  setAiDiagnosticRunning: (status: boolean) => void;
}

export const useIntelligenceStore = create<IntelligenceState>((set) => ({
  selectedAccountId: null,
  dateRange: '14d',
  isAiDiagnosticRunning: false,
  setSelectedAccountId: (id) => set({ selectedAccountId: id }),
  setDateRange: (range) => set({ dateRange: range }),
  setAiDiagnosticRunning: (status) => set({ isAiDiagnosticRunning: status }),
}));
