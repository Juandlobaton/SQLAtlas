import { Search } from 'lucide-react';

interface SidePanelSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}

export function SidePanelSearch({ value, onChange, placeholder }: SidePanelSearchProps) {
  return (
    <div className="p-2 border-b border-surface-200/60">
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-400" />
        <input
          className="input pl-8 text-xs py-1.5 w-full"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </div>
  );
}
