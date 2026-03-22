import { Outlet } from "react-router";

import { TargetCursor } from "./components/TargetCursor";

export default function DeadlockdleLayout() {
  return (
    <>
      <TargetCursor />
      <Outlet />
    </>
  );
}
