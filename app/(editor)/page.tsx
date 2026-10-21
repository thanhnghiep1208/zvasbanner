import { auth } from "@clerk/nextjs/server";

import { EditorWorkspace } from "@/components/layout/EditorWorkspace";
import { getContactInfo } from "@/lib/contact-settings";
import { isFlowCanvasEnabled } from "@/lib/flags";

export default async function EditorPage() {
  // Flag đọc env server-only → truyền xuống nút "Mở trong canvas" (T6.2).
  const { userId } = await auth();
  // Liên hệ cấp tài khoản hiện khi client chưa đăng nhập (admin sửa ở /dashboard).
  const { value: contact } = await getContactInfo();
  return <EditorWorkspace flowCanvasEnabled={isFlowCanvasEnabled(userId)} contact={contact} />;
}
