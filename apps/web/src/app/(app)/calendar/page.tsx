"use client";

import { useState, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { EventList } from "@/components/calendar/event-list";
import { CreateEventDialog } from "@/components/calendar/create-event-dialog";
import { AppShell } from "@/components/layout/app-shell";
import { Calendar } from "lucide-react";
import type { CalendarEvent } from "@/lib/api";

export default function CalendarPage() {
  const { organization } = useAuth();
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  const handleSelectEvent = useCallback((event: CalendarEvent) => {
    setSelectedEventId(event.id);
  }, []);

  const handleCreateEvent = useCallback(() => {
    setIsCreateDialogOpen(true);
  }, []);

  const handleEventCreated = useCallback((event: CalendarEvent) => {
    // Add the new event to the list and select it
    EventList.addEvent(event);
    setSelectedEventId(event.id);
  }, []);

  const sidebar = (
    <EventList
      selectedEventId={selectedEventId}
      onSelectEvent={handleSelectEvent}
      onCreateEvent={handleCreateEvent}
    />
  );

  return (
    <>
      <AppShell sidebar={sidebar}>
        {selectedEventId ? (
          <div className="flex flex-col h-full">
            {/* Event header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Event Details
                </h2>
              </div>
            </div>

            {/* Event details - placeholder for now */}
            <div className="flex-1 p-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Selected event: {selectedEventId}
              </p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
                Event details view coming soon.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900">
            <div className="text-center">
              <div className="flex justify-center mb-4">
                <div className="p-4 rounded-full bg-gray-100 dark:bg-gray-800">
                  <Calendar className="h-8 w-8 text-gray-400 dark:text-gray-500" />
                </div>
              </div>
              <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                Calendar
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                Welcome to {organization?.name || "your organization"}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-500 mt-4">
                Select an event from the sidebar or create a new one
              </p>
            </div>
          </div>
        )}
      </AppShell>

      {/* Create event dialog */}
      <CreateEventDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onEventCreated={handleEventCreated}
      />
    </>
  );
}
