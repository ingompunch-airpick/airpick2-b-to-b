import React, { ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error at ErrorBoundary:", error, errorInfo);
  }

  private handleReset = () => {
    try {
      localStorage.clear();
      window.location.reload();
    } catch (_) {
      window.location.reload();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-neutral-950 text-zinc-100 flex flex-col items-center justify-center p-6 font-sans">
          <div className="max-w-md w-full bg-neutral-900 border border-neutral-800/80 rounded-2xl p-8 text-center shadow-2xl relative overflow-hidden">
            {/* Ambient indicator lights */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-1 bg-amber-500 rounded-full blur-sm opacity-60"></div>
            
            <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-inner">
              <span className="text-3xl font-black">!</span>
            </div>

            <h1 className="text-lg font-black text-white mb-2 tracking-tight">
              일시적인 오류가 발생했습니다
            </h1>

            <p className="text-xs text-zinc-400 leading-relaxed mb-6">
              저장된 임시 정보에 문제가 있어 화면을 표시하지 못했습니다. 아래 버튼을 눌러 다시 시작해 주세요. 문제가 계속되면 에어픽 고객센터로 문의해 주세요.
            </p>

            <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3 mb-6 text-left">
              <span className="text-[12px] font-mono font-bold text-zinc-500 block uppercase tracking-wider mb-1">
                오류 정보
              </span>
              <p className="text-[13px] font-mono text-amber-500 break-all leading-normal">
                {this.state.error?.message || '화면을 불러오는 중 오류가 발생했습니다.'}
              </p>
            </div>

            <div className="flex flex-col gap-2.5">
              <button
                onClick={this.handleReset}
                className="w-full py-3 bg-amber-500 hover:bg-amber-450 text-neutral-950 rounded-xl text-xs font-black transition-all shadow-md active:scale-[0.98]"
              >
                브라우저 캐시 초기화 및 다시 시작
              </button>
              
              <button
                onClick={() => window.location.reload()}
                className="w-full py-3 bg-neutral-850 hover:bg-neutral-800 text-zinc-300 border border-neutral-800 rounded-xl text-xs font-medium transition-all"
              >
                새로고침 시도
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
