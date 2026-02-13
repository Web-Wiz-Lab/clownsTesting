import { lazy, Suspense } from 'react';
import { SchedulePage } from './features/schedule/SchedulePage';

const isPreview = import.meta.env.DEV && window.location.pathname === '/preview';

const PreviewPage = isPreview
  ? lazy(() => import('./features/preview/PreviewPage').then((m) => ({ default: m.PreviewPage })))
  : null;

function App() {
  if (PreviewPage) {
    return (
      <Suspense fallback={<div className="flex items-center justify-center h-screen text-muted-foreground">Loading preview...</div>}>
        <PreviewPage />
      </Suspense>
    );
  }

  return <SchedulePage />;
}

export default App;
