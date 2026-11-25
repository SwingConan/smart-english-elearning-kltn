import { useEffect, useRef, useState } from 'react';
import { DurableS10Session, type S10ClientState } from './durable-s10-session';
type Props = {
  attemptId: string;
  questionId: string;
  source: string;
  active: boolean;
  initialAudioUrl: string | null;
  onSaved: (id: string, saved: boolean) => void;
  onSaveState: (
    id: string,
    state: 'PLAYING_PROMPT' | 'RECORDING' | 'LOCAL_DRAFT' | 'UPLOADING' | 'ERROR' | null,
  ) => void;
  onUploading: (id: string, value: boolean) => void;
};
export function DoublePromptAnswer(props: Props) {
  const callbacks = useRef(props);
  useEffect(() => {
    callbacks.current = props;
  }, [props]);
  const session = useRef<DurableS10Session | null>(null);
  const [state, setState] = useState<S10ClientState>({ phase: 'IDLE', started: 0, remaining: 30 });
  const { attemptId, questionId, active } = props;
  useEffect(() => {
    if (!active) return;
    const client = new DurableS10Session(attemptId, questionId, setState, () =>
      callbacks.current.onSaved(questionId, true),
    );
    session.current = client;
    void client.activate();
    return () => {
      client.dispose();
      session.current = null;
      callbacks.current.onUploading(questionId, false);
    };
  }, [attemptId, questionId, active]);
  useEffect(() => {
    const busy = [
      'PREPARING',
      'PLAYING',
      'NEEDS_GESTURE',
      'RECORDING',
      'CONFIRMING',
      'UPLOADING',
    ].includes(state.phase);
    callbacks.current.onUploading(questionId, busy);
    callbacks.current.onSaveState(
      questionId,
      state.phase === 'RECORDING'
        ? 'RECORDING'
        : ['CONFIRMING', 'UPLOADING'].includes(state.phase)
          ? 'UPLOADING'
          : ['PLAYING', 'NEEDS_GESTURE', 'PREPARING'].includes(state.phase)
            ? 'PLAYING_PROMPT'
            : ['RECORDED', 'UPLOAD_RETRY'].includes(state.phase)
              ? 'LOCAL_DRAFT'
              : state.phase === 'SAVED' || state.phase === 'IDLE'
                ? null
                : 'ERROR',
    );
  }, [state, questionId]);
  return (
    <div className="mt-4 rounded-xl bg-slate-50 p-4" data-testid="double-prompt-answer">
      <p aria-live="polite">
        {state.phase === 'PLAYING'
          ? `Đang phát câu hỏi lần ${state.started}/2. Chưa bắt đầu ghi âm.`
          : state.phase === 'RECORDING'
            ? `Đang ghi âm · còn ${state.remaining}/30 giây`
            : state.phase === 'SAVED'
              ? 'Đã lưu câu trả lời'
              : state.phase === 'RECORDED'
                ? 'Đã ghi âm. Hãy lưu câu trả lời.'
                : state.phase === 'CONFIRMING'
                  ? 'Đang xác nhận bản ghi…'
                  : state.phase === 'UPLOADING'
                    ? 'Đang lưu…'
                    : state.phase === 'PREPARING'
                      ? 'Đang kiểm tra trạng thái và microphone…'
                      : state.phase === 'NEEDS_GESTURE'
                        ? 'Trình duyệt yêu cầu thao tác để cho phép phát audio.'
                        : null}
      </p>
      {state.phase === 'NEEDS_GESTURE' ? (
        <button type="button" onClick={() => session.current?.resumePlayback()}>
          Cho phép phát câu hỏi
        </button>
      ) : null}
      {state.phase === 'MIC_ERROR' ? (
        <>
          <p role="alert">Không thể mở microphone. Chưa phát câu hỏi.</p>
          <button type="button" onClick={() => void session.current?.activate()}>
            Thử microphone lại
          </button>
        </>
      ) : null}
      {state.phase === 'BLOCKED' ? (
        <p role="alert">
          Phần thi bị gián đoạn. Không phát thêm và không chấm 0. Liên hệ học vụ để xem xét khôi
          phục. Mã: {state.error}
        </p>
      ) : null}
      {state.phase === 'UPLOAD_RETRY' ? (
        <p role="alert">
          Tải ghi âm thất bại. Giữ nguyên bản ghi để thử lại trong thời hạn lưu; chưa có điểm.
        </p>
      ) : null}
      {['RECORDED', 'UPLOAD_RETRY'].includes(state.phase) ? (
        <button type="button" onClick={() => void session.current?.upload()}>
          Lưu câu trả lời
        </button>
      ) : null}
      {state.phase === 'SAVED' && state.playbackUrl ? (
        <audio controls src={state.playbackUrl} aria-label="Bản ghi câu trả lời đã lưu" />
      ) : null}
    </div>
  );
}
