import { Component, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

function ErrorFallbackUI({ error, onReload }: { error: Error | null; onReload: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
      <div className="text-center p-8">
        <h1 className="text-2xl font-bold mb-4">{t('errorBoundary.title')}</h1>
        <p className="text-gray-400 mb-6">
          {error?.message || t('errorBoundary.defaultMessage')}
        </p>
        <button
          onClick={onReload}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
        >
          {t('errorBoundary.reload')}
        </button>
      </div>
    </div>
  );
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <ErrorFallbackUI error={this.state.error} onReload={() => window.location.reload()} />
      );
    }
    return this.props.children;
  }
}
