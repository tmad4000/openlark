"use client";

import { useState, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { MiniCalendar } from "@/components/calendar/mini-calendar";
import { MonthlyCalendar } from "@/components/calendar/monthly-calendar";
import { EventDetails } from "@/components/calendar/event-details";
import { CreateEventDialog } from "@/components/calendar/create-event-dialog";
import { AppShell } from "@/components/layout/app-shell";
import { Calendar, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CalendarEvent } from "@/lib/api";

export default function CalendarPage() {
  const { user } = useAuth();
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [createPrefillDate, setCreatePrefillDate] = useState<Date | null>(null);

  const handleNavigate = useCallback((date: Date) => {
    setCurrentDate(date);
  }, []);

  const handleSelectDate = useCallback((date: Date) => {
    setSelectedDate(date);
  }, []);

  const handleCreateEvent = useCallback((prefillDate: Date) => {
    setCreatePrefillDate(prefillDate);
    setIsCreateDialogOpen(true);
  }, []);

  const handleCreateButtonClick = useCallback(() => {
    setCreatePrefillDate(null);
    setIsCreateDialogOpen(true);
  }, []);

  const handleViewEventDetails = useCallback((event: CalendarEvent) => {
    setSelectedEventId(event.id);
  }, []);

  const handleEventCreated = useCallback((_event: CalendarEvent) => {
    // Close dialog; MonthlyCalendar will reload events on next render cycle
    setSelectedEventId(null);
  }, []);

  const handleBackToCalendar = useCallback(() => {
    setSelectedEventId(null);
  }, []);

  const sidebar = (
    <div className="flex flex-col h-full">
      {/* Create event button */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-800">
        <Button
          onClick={handleCreateButtonClick}
          className="w-full"
          size="sm"
        >
          <Plus className="h-4 w-4 mr-2" />
          New event
        </Button>
      </div>

      {/* Mini calendar */}
      <MiniCalendar
        currentDate={currentDate}
        selectedDate={selectedDate}
        onSelectDate={(date) => {
          handleSelectDate(date);
          handleNavigate(new Date(date.getFullYear(), date.getMonth(), 1));
        }}
        onNavigate={handleNavigate}
      />

      {/* Spacer */}
      <div className="flex-1" />
    </div>
  );

  const rightPanel =
    selectedEventId && user ? (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-800">
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
            Event Details
          </span>
          <button
            onClick={handleBackToCalendar}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            Close
          </button>
        </div>
        <EventDetails eventId={selectedEventId} currentUserId={user.id} />
      </div>
    ) : undefined;

  return (
    <>
      <AppShell sidebar={sidebar} rightPanel={rightPanel}>
        <MonthlyCalendar
          currentDate={currentDate}
          onNavigate={handleNavigate}
          onCreateEvent={handleCreateEvent}
          onViewEventDetails={handleViewEventDetails}
        />
      </AppShell>

      <CreateEventDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onEventCreated={handleEventCreated}
        defaultStartTime={createPrefillDate ?? undefined}
      />
    </>
  );
}
