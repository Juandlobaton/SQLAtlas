interface ModulePageLayoutProps {
  toolbar?: React.ReactNode;
  sidebar?: React.ReactNode;
  children: React.ReactNode;
  rightPanel?: React.ReactNode;
}

export function ModulePageLayout({ toolbar, sidebar, children, rightPanel }: ModulePageLayoutProps) {
  return (
    <div className="h-full flex flex-col">
      {toolbar}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {sidebar}
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">{children}</div>
        {rightPanel}
      </div>
    </div>
  );
}
