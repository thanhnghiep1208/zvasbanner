import { auth } from "@clerk/nextjs/server";

import { EditorWorkspace } from "@/components/layout/EditorWorkspace";
import { isFlowCanvasEnabled } from "@/lib/flags";

export default async function EditorPage() {
  // Flag đọc env server-only → truyền xuống nút "Mở trong canvas" (T6.2).
  const { userId } = await auth();
  return <EditorWorkspace flowCanvasEnabled={isFlowCanvasEnabled(userId)} />;
}
