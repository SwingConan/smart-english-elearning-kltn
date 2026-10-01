import { placementApi } from './api';
import type { PlacementSelfLevel, PlacementStartResponse } from './types';

export async function startPlacementInNewTab(
  input: { mode: 'LR'; selfLevel: PlacementSelfLevel; goalScore: number },
  openWindow: () => Window | null = () => window.open('', '_blank'),
): Promise<PlacementStartResponse> {
  const examWindow = openWindow();
  if (!examWindow) throw new Error('POPUP_BLOCKED');
  try {
    examWindow.document.title = 'Đang chuẩn bị bài kiểm tra…';
    const attempt = await placementApi.start(input);
    examWindow.location.assign(`/placement/attempts/${attempt.attemptId}/exam`);
    return attempt;
  } catch (error) {
    examWindow.close();
    throw error;
  }
}

export function announcePlacementSubmitted(attemptId: string) {
  const payload = JSON.stringify({ type: 'PLACEMENT_SUBMITTED', attemptId, at: Date.now() });
  if ('BroadcastChannel' in window) {
    const channel = new BroadcastChannel('smart-english-placement');
    channel.postMessage(JSON.parse(payload));
    channel.close();
  }
  localStorage.setItem('smart-english:placement-event', payload);
}
