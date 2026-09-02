'use client';

import { Component, type ReactNode } from 'react';

// React only supports catching render/lifecycle exceptions via a class
// component — there is no hooks equivalent. Used to wrap the /map screen's
// Leaflet tree (components/map/*) so a bug in third-party map code, or an
// unexpectedly-shaped coffee shop record, degrades to an inline message
// instead of Next's full-page "Application error" crash screen.
interface Props {
  children: ReactNode;
  fallback: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('[ErrorBoundary] caught render error:', error);
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}
