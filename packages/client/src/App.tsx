import { useStore } from './store';
import { Home } from './screens/Home';
import { Lobby } from './screens/Lobby';
import { Table } from './screens/Table';

export function App() {
  const { state, clearError } = useStore();

  let screen;
  if (state.resuming) {
    screen = <div className="center-note">Reconnecting…</div>;
  } else if (state.session === null) {
    screen = <Home />;
  } else if (state.roomState === null) {
    screen = <div className="center-note">Joining room…</div>;
  } else if (state.roomState.phase === 'inGame') {
    screen = state.view !== null ? <Table /> : <div className="center-note">Loading game…</div>;
  } else {
    screen = <Lobby />;
  }

  return (
    <div className="app">
      {!state.connected && !state.resuming && state.mode === 'online' && state.session !== null && (
        <div className="banner warn">Connection lost — reconnecting…</div>
      )}
      {state.error !== null && (
        <div className="banner error" onClick={clearError}>
          {state.error} <span className="dismiss">✕</span>
        </div>
      )}
      <div className="toasts">
        {state.toasts.map((t) => (
          <div key={t.id} className="toast">
            {t.text}
          </div>
        ))}
      </div>
      {screen}
    </div>
  );
}
