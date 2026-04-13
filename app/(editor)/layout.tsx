export default function EditorLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <div className="h-dvh max-h-dvh min-h-0 overflow-hidden">{children}</div>;
}
