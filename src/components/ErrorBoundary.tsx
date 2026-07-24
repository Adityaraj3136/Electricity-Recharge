import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in application:', error, errorInfo);
  }

  private handleReset = () => {
    // Clear error state and optionally force navigation to home
    this.setState({ hasError: false, error: null });
    window.location.href = '/'; // Reset full application state and routing
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full flex flex-col items-center justify-center p-6 bg-slate-50 dark:bg-slate-950 text-center animate-in fade-in duration-300">
          <div className="w-24 h-24 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-6 shadow-sm">
            <AlertTriangle className="w-12 h-12 text-red-600 dark:text-red-400" />
          </div>
          
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">
            Oops! Something went wrong
          </h1>
          
          <p className="text-gray-500 dark:text-gray-400 mb-8 max-w-md mx-auto leading-relaxed">
            We encountered an unexpected error. Please try reloading the page or return to the home screen.
          </p>

          {this.state.error && (
            <div className="w-full max-w-md mb-8 p-4 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-xl text-left overflow-hidden">
              <p className="text-xs font-mono text-red-800 dark:text-red-300 break-words">
                {this.state.error.message}
              </p>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-4 w-full max-w-sm">
            <button
              onClick={() => window.location.reload()}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3.5 bg-white dark:bg-slate-900 border-2 border-gray-200 dark:border-slate-800 text-gray-700 dark:text-gray-200 rounded-xl font-bold hover:bg-gray-50 dark:hover:bg-slate-800 active:scale-95 transition-all shadow-sm"
            >
              <RefreshCw size={18} />
              Reload App
            </button>
            
            <button
              onClick={this.handleReset}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3.5 bg-primary-600 text-white rounded-xl font-bold hover:bg-primary-700 active:scale-95 transition-all shadow-lg shadow-primary-500/30"
            >
              <Home size={18} />
              Go Home
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
