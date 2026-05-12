import React, { useState, useMemo } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

interface FilterItem {
  id: string;
  name: string;
}

interface HierarchyFilterProps {
  label: string;
  items: FilterItem[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}

export function HierarchyFilter({ label, items, selectedIds, onChange, disabled }: HierarchyFilterProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filteredItems = useMemo(() => {
    if (!search.trim()) return items;
    return items.filter(item => item.name.toLowerCase().includes(search.toLowerCase()));
  }, [items, search]);

  const toggleItem = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter(v => v !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const selectAll = () => {
    if (selectedIds.length === items.length && items.length > 0) {
      onChange([]);
    } else {
      onChange(items.map(i => i.id));
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        className="w-[120px] flex px-3 h-9 items-center justify-between rounded-md text-gray-700 border border-gray-200 bg-white text-[13px] font-normal relative disabled:opacity-50 disabled:cursor-not-allowed hover:border-meta-blue transition-colors"
      >
        <span className="truncate">{selectedIds.length > 0 ? `已选 ${selectedIds.length}` : label}</span>
        <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <div className="flex flex-col h-full max-h-[300px]">
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <input
              className="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
              placeholder={`搜索 ${label}...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="overflow-y-auto p-1">
            <div
              className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-gray-100 data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
              onClick={selectAll}
            >
              <Checkbox
                checked={selectedIds.length === items.length && items.length > 0}
                className="mr-2"
              />
              全选
            </div>
            {filteredItems.map((item) => (
              <div
                key={item.id}
                className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-gray-100 data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                onClick={() => toggleItem(item.id)}
              >
                <Checkbox
                  checked={selectedIds.includes(item.id)}
                  className="mr-2"
                />
                <span className="truncate">{item.name}</span>
              </div>
            ))}
            {filteredItems.length === 0 && (
              <div className="py-6 text-center text-sm text-gray-500">
                未找到结果。
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
