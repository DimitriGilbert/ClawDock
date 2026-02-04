import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { trpc, queryClient } from "@/utils/trpc";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export function ComposeEditorDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [content, setContent] = useState("");
  
  // Fetch compose file
  const { data, isLoading, isError } = useQuery(
    trpc.stack.getCompose.queryOptions(undefined, { 
      enabled: open,
      staleTime: 0 
    })
  );

  // Sync content when data arrives
  useEffect(() => {
    if (data?.content) {
      setContent(data.content);
    }
  }, [data]);

  const updateMutation = useMutation({
    ...trpc.stack.updateCompose.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.stack.getCompose.queryKey() });
    },
  });

  const applyMutation = useMutation(trpc.stack.applyChanges.mutationOptions());

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync({ content });
      toast.success("Compose file saved successfully");
    } catch (error) {
      toast.error(`Failed to save: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  };

  const handleSaveAndApply = async () => {
    try {
      // 1. Save
      await updateMutation.mutateAsync({ content });
      toast.info("Applying changes...");
      
      // 2. Apply
      const result = await applyMutation.mutateAsync();
      
      toast.success("Stack updated successfully");
      if (result.output) {
        console.log("Docker output:", result.output);
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(`Failed to apply: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Edit Docker Compose</DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 min-h-0 relative">
          {isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : isError ? (
            <div className="absolute inset-0 flex items-center justify-center text-destructive">
              Failed to load compose file
            </div>
          ) : (
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full h-full resize-none p-4 font-mono text-sm bg-muted/50 rounded-md border focus:outline-none focus:ring-2 focus:ring-ring"
              spellCheck={false}
            />
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <div className="flex-1 text-xs text-muted-foreground flex items-center">
            {data?.path && `Editing: ${data.path}`}
          </div>
          <Button 
            variant="outline" 
            onClick={handleSave} 
            disabled={isLoading || updateMutation.isPending || applyMutation.isPending}
          >
            {updateMutation.isPending ? "Saving..." : "Save Only"}
          </Button>
          <Button 
            onClick={handleSaveAndApply}
            disabled={isLoading || updateMutation.isPending || applyMutation.isPending}
          >
            {applyMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Applying...
              </>
            ) : (
              "Save & Apply"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
