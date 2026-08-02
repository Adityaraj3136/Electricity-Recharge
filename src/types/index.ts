export interface Consumer {
  id: string;
  name: string;
  caNumber: string;
  mobileNumber?: string;
  preferredAmount?: string;
  preferredGateway?: 'Bank of Baroda' | 'Easebuzz' | 'HDFC';
  lastFetchedBalance?: string;
  lastFetchedDate?: string;
  /** Epoch ms of the last successful fetch. lastFetchedDate is only a
      dd/mm/yyyy string, too coarse to tell a five-minute-old balance from an
      eight-hour-old one. */
  lastFetchedAt?: number;
  currentStatus?: string;
}

export interface AppSettings {
  darkMode: boolean;
  biometricLock: boolean;
  reminderEnabled: boolean;
  reminderDay: number;
  fontSize: 'small' | 'medium' | 'large';
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

export interface BalanceDetails {
  caNumber: string;
  name: string;
  division?: string;
  subDivision?: string;
  lastRechargeDate: string;
  lastRechargeAmount: string;
  consumerType?: string;
  currentStatus: string;
  availableBalance: string;
  amispVendor: string;
}
