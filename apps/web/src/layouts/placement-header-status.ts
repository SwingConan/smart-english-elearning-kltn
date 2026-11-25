import { createContext, useContext } from 'react';

export type PlacementHeaderStatus =
  | 'IN_PROGRESS'
  | 'SUBMITTED_PENDING_REVIEW'
  | 'PUBLISHED'
  | 'BLOCKED_REVIEW'
  | null;

export type PlacementHeaderStatusContextValue = {
  status: PlacementHeaderStatus;
  setStatus: (status: PlacementHeaderStatus) => void;
};

export const PlacementHeaderStatusContext = createContext<PlacementHeaderStatusContextValue>({
  status: null,
  setStatus: () => {},
});

export function usePlacementHeaderStatus() {
  return useContext(PlacementHeaderStatusContext);
}
