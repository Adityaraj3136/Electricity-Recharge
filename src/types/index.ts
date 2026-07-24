export interface Consumer {
  id: string;
  name: string;
  caNumber: string;
  mobileNumber?: string;
  preferredAmount?: string;
  preferredGateway?: 'Bank of Baroda' | 'Easebuzz' | 'HDFC';
}

export interface AppSettings {
  darkMode: boolean;
}

export type AutomationStep = 
  | 'Opening website'
  | 'Filling CA Number'
  | 'Searching'
  | 'Loading consumer'
  | 'Filling mobile'
  | 'Selecting amount'
  | 'Selecting gateway'
  | 'Opening payment'
  | 'Done';

export interface AutomationProgress {
  currentStep: AutomationStep;
  completedSteps: AutomationStep[];
  error?: string;
}
