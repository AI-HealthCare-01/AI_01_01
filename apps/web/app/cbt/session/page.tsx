import { Suspense } from "react";

import CbtSessionScreen from "../../../src/features/cbt/session-screen";

export default function CbtSessionPage() {
  return (
    <Suspense fallback={null}>
      <CbtSessionScreen />
    </Suspense>
  );
}
