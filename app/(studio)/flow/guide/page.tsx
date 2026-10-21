import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { isFlowCanvasEnabled } from '@/lib/flags';
import { FlowGuide } from '@/components/flow/guide/FlowGuide';

export const metadata = {
  title: 'Hướng dẫn chế độ nâng cao – zVas Banner AI',
  robots: { index: false },
};

export default async function FlowGuidePage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  // Cùng flag với /flow: tắt → 404.
  if (!isFlowCanvasEnabled(userId)) notFound();

  return <FlowGuide />;
}
