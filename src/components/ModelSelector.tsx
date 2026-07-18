import { Zap, BrainCircuit } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

export const MODEL_OPTIONS = [
  {
    value: "openai/gpt-oss-20b",
    label: "Fast",
    description: "openai/gpt-oss-20b",
    icon: Zap,
  },
  {
    value: "openai/gpt-oss-120b",
    label: "Smart",
    description: "openai/gpt-oss-120b",
    icon: BrainCircuit,
  },
] as const;

export type ModelValue = (typeof MODEL_OPTIONS)[number]["value"];

interface ModelSelectorProps {
  value: ModelValue;
  onChange: (value: ModelValue) => void;
}

const ModelSelector = ({ value, onChange }: ModelSelectorProps) => {
  const current = MODEL_OPTIONS.find((m) => m.value === value) ?? MODEL_OPTIONS[0];
  const Icon = current.icon;

  return (
    <Select value={value} onValueChange={(v) => onChange(v as ModelValue)}>
      <SelectTrigger className="h-8 w-auto gap-1.5 rounded-full border-none bg-secondary px-3 text-xs font-medium hover:bg-secondary/80 focus:ring-0 focus:ring-offset-0">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <SelectValue asChild>
          <span className="whitespace-nowrap">{current.label}</span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="end">
        {MODEL_OPTIONS.map((model) => {
          const OptIcon = model.icon;
          return (
            <SelectItem key={model.value} value={model.value}>
              <div className="flex items-center gap-2">
                <OptIcon className="h-3.5 w-3.5 shrink-0" />
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{model.label}</span>
                  <span className="text-[10px] text-muted-foreground">{model.description}</span>
                </div>
              </div>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
};

export default ModelSelector;