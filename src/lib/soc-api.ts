// SOC (Security Operations Center) API types and functions
const BACKEND_ORIGIN = (import.meta.env.VITE_BACKEND_ORIGIN || '').replace(/\/$/, '');
const API_BASE = `${BACKEND_ORIGIN}/api`;

export interface SocAlert {
  id: string;
  timestamp: string;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  mitre_id: string;
  mitre_name: string;
  mitre_tactic: string;
  source: 'wazuh' | 'simulation';
}

export interface AlertAnalysis {
  alert_id: string;
  attack_type: string;
  technique: string;
  tactic: string;
  severity: string;
  confidence: string;
  recommended_action: string;
  ioc_summary: string;
}

async function fetchWithAuth<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options?.headers,
  };

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    credentials: 'include',
    headers,
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export const socApi = {
  async getAlerts(): Promise<SocAlert[]> {
    return fetchWithAuth<SocAlert[]>('/alerts');
  },

  async analyzeAlert(alert: SocAlert): Promise<AlertAnalysis> {
    return fetchWithAuth<AlertAnalysis>('/analyze-alert', {
      method: 'POST',
      body: JSON.stringify(alert),
    });
  },
};
