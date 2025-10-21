import React, { useState, useEffect, useRef } from 'react';
import { calendarAPI } from '../services/api';
import SuccessToast from './SuccessToast';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { toZonedTime } from 'date-fns-tz';
import timezones from '../utils/timezones'; // We'll create this file for the timezone list

const CalendarEvents = ({ events: propEvents, error: propError }) => {
  const [events, setEvents] = useState(propEvents || []);
  const [loading, setLoading] = useState(!propEvents);
  const [error, setError] = useState(propError || null);
  const [toast, setToast] = useState({ isVisible: false, message: '', type: 'success' });
  const [selectedRange, setSelectedRange] = useState({ start: null, end: null });
  const [dragging, setDragging] = useState(false);
  const calendarRef = useRef(null);
  const [editingEvent, setEditingEvent] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [userTimezone, setUserTimezone] = useState('');
  const [detectedTimezone, setDetectedTimezone] = useState('');
  const [savingTimezone, setSavingTimezone] = useState(false);
  const [timezoneError, setTimezoneError] = useState('');
  const [syncing, setSyncing] = useState(false);
  
  // Add caching state
  const [lastFetchTime, setLastFetchTime] = useState(null);
  const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

  // --- Delete Event Logic ---
  const [deletingEvent, setDeletingEvent] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [showEventOverlay, setShowEventOverlay] = useState(false);
  const [overlayPosition, setOverlayPosition] = useState({ x: 0, y: 0 });
  
  // Events organized by day and time slot
  const [eventsByDayTime, setEventsByDayTime] = useState({});
  
  // Use ref to track if we need to update eventsByDayTime
  const eventsByDayTimeRef = useRef({});

  // Calculate rangeDays for the selected range
  const rangeDays = getRangeDays(selectedRange.start, selectedRange.end);

  // Fetch user timezone on mount
  useEffect(() => {
    const fetchTimezone = async () => {
      try {
        const token = localStorage.getItem('jwt_token');
        const res = await fetch('/api/user/settings', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
          credentials: 'include', // optional, only needed if you use cookies too
        });
        if (!res.ok) throw new Error('Failed to fetch user settings');
        const data = await res.json();
        setUserTimezone(data.timezone || '');
      } catch (err) {
        setTimezoneError('Could not load timezone');
      }
    };
    fetchTimezone();
    // Auto-detect timezone
    setDetectedTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);

  const handleSaveTimezone = async () => {
    setSavingTimezone(true);
    setTimezoneError('');
    try {
      const token = localStorage.getItem('jwt_token');
      const res = await fetch('/api/user/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        credentials: 'include',
        body: JSON.stringify({ timezone: userTimezone })
      });
      if (!res.ok) throw new Error('Failed to save timezone');
      setShowSettings(false);
      showToast('Timezone updated!', 'success');
    } catch (err) {
      setTimezoneError('Could not save timezone');
    } finally {
      setSavingTimezone(false);
    }
  };

  useEffect(() => {
    if (!propEvents) {
      loadEvents();
    }
  }, [propEvents]);

  // Close event overlay when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showEventOverlay && !event.target.closest('.event-overlay-container')) {
        setShowEventOverlay(false);
        setSelectedEvent(null);
        setOverlayPosition({ x: 0, y: 0 });
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showEventOverlay]);

  // Process events for display
  useEffect(() => {
    if (events.length === 0 || rangeDays.length === 0) {
      return;
    }

    // Simple cache check to prevent unnecessary processing
    const cacheKey = `${rangeDays.map(d => d.toDateString()).join(',')}-${events.length}`;
    if (eventsByDayTimeRef.current.cacheKey === cacheKey) {
      return;
    }

    // Initialize time slots for each day in the range
    const newEventsByDayTime = {};
    rangeDays.forEach(day => {
      const key = day.toDateString();
      newEventsByDayTime[key] = {};
      TIME_SLOTS.forEach(({ hour, min }) => {
        newEventsByDayTime[key][`${hour}:${min}`] = [];
      });
    });

    // Process each event
    events.forEach((event) => {
      // Get the user's timezone (preferred or detected)
      const tz = userTimezone || detectedTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      
      // Convert UTC time to user's timezone
      const utcDate = new Date(event.start.dateTime || event.start);
      const eventDate = toZonedTime(utcDate, tz);
      eventDate.setSeconds(0, 0);
      const dayKey = eventDate.toDateString();
      const hour = eventDate.getHours();
      const min = eventDate.getMinutes() - (eventDate.getMinutes() % 15);
      
      if (newEventsByDayTime[dayKey] && newEventsByDayTime[dayKey][`${hour}:${min}`]) {
        newEventsByDayTime[dayKey][`${hour}:${min}`].push(event);
      }
    });
    
    // Update the state with the processed events
    setEventsByDayTime(newEventsByDayTime);
    eventsByDayTimeRef.current = { cacheKey };
  }, [events, rangeDays, userTimezone, detectedTimezone]);

  // Update current time every minute, using user-selected or detected timezone

  const loadEvents = async (forceRefresh = false) => {
    try {
      // Check if we have cached data and it's still valid
      const now = Date.now();
      if (!forceRefresh && lastFetchTime && (now - lastFetchTime) < CACHE_DURATION && events.length > 0) {
        setLoading(false);
        return;
      }
      
      setLoading(true);
      const response = await calendarAPI.getEvents(1000); // Increased from 100 to 1000
      const eventsData = Array.isArray(response.data) ? response.data : [];
      setEvents(eventsData);
      setLastFetchTime(now);
      setError(null);
    } catch (err) {
        setError('Failed to load calendar events');
    } finally {
      setLoading(false);
    }
  };

  const showToast = (message, type = 'success') => {
    setToast({ isVisible: true, message, type });
  };
  const handleCloseToast = () => setToast({ ...toast, isVisible: false });

  const handleManualSync = async () => {
    setSyncing(true);
    try {
      const response = await calendarAPI.syncEvents();
      showToast(`Sync completed! ${response.data.message}`, 'success');
      // Force refresh events after sync
      await loadEvents(true);
    } catch (error) {
      showToast('Sync failed. Please try again.', 'error');
    } finally {
      setSyncing(false);
    }
  };

  // --- Monthly Calendar Logic ---
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));

  const getMonthDays = (month) => {
    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    const firstDay = new Date(year, monthIndex, 1);
    const lastDay = new Date(year, monthIndex + 1, 0);
    const days = [];
    // Fill leading days from previous month
    for (let i = 0; i < firstDay.getDay(); i++) {
      days.push(null);
    }
    // Fill current month days
    for (let d = 1; d <= lastDay.getDate(); d++) {
      days.push(new Date(year, monthIndex, d));
    }
    // Fill trailing days to complete the grid
    while (days.length % 7 !== 0) {
      days.push(null);
    }
    return days;
  };

  const monthDays = getMonthDays(currentMonth);

  // --- Click and Drag Selection ---
  const handleDayMouseDown = (date) => {
    setSelectedRange({ start: date, end: date });
    setDragging(true);
  };
  const handleDayMouseEnter = (date) => {
    if (dragging && selectedRange.start) {
      setSelectedRange({ start: selectedRange.start, end: date });
    }
  };
  const handleMouseUp = () => {
    setDragging(false);
  };
  useEffect(() => {
    if (dragging) {
      document.addEventListener('mouseup', handleMouseUp);
      return () => document.removeEventListener('mouseup', handleMouseUp);
    }
  }, [dragging]);

  const isSelected = (date) => {
    if (!selectedRange.start || !date) return false;
    const start = selectedRange.start < selectedRange.end ? selectedRange.start : selectedRange.end;
    const end = selectedRange.start > selectedRange.end ? selectedRange.start : selectedRange.end;
    return date >= start && date <= end;
  };

  // Utility to check if a date is today
  function isToday(date) {
    const now = new Date();
    return (
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate()
    );
  }

  // Utility to calculate optimal overlay position to keep it on screen
  function calculateOptimalPosition(clickX, clickY, overlayWidth = 320, overlayHeight = 200) {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    let x = clickX;
    let y = clickY;
    
    // Debug logging
    
    // Adjust horizontal position if overlay would go off-screen
    if (clickX + overlayWidth / 2 > viewportWidth) {
      x = viewportWidth - overlayWidth / 2 - 20; // 20px margin
    } else if (clickX - overlayWidth / 2 < 0) {
      x = overlayWidth / 2 + 20; // 20px margin
    }
    
    // Adjust vertical position if overlay would go off-screen
    if (clickY + overlayHeight / 2 > viewportHeight) {
      y = viewportHeight - overlayHeight / 2 - 20; // 20px margin
    } else if (clickY - overlayHeight / 2 < 0) {
      y = overlayHeight / 2 + 20; // 20px margin
    }
    
    return { x, y };
  }

  // --- Filter Events for Selected Range ---
  const getEventsForRange = () => {
    if (!selectedRange.start || !selectedRange.end) return [];
    const start = selectedRange.start < selectedRange.end ? selectedRange.start : selectedRange.end;
    const end = selectedRange.start > selectedRange.end ? selectedRange.start : selectedRange.end;
    const tz = userTimezone || detectedTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    return events.filter(event => {
      const eventDate = toZonedTime(new Date(event.start.dateTime || event.start), tz);
      eventDate.setHours(0, 0, 0, 0);
      return eventDate >= start && eventDate <= end;
    });
  };

  // --- Calendar Navigation ---
  const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  
  // Add refresh function
  const handleRefresh = async () => {
    await loadEvents(true);
    showToast('Calendar refreshed!', 'success');
  };

  // --- Drag-and-drop event move handler ---
  const handleMoveEvent = async (event, newDay, newHour, newMin) => {
    const tz = userTimezone || detectedTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const start = new Date(newDay);
    start.setHours(newHour, newMin, 0, 0);
    let end = null;
    if (event.end) {
      const duration = toZonedTime(new Date(event.end.dateTime || event.end), tz) - toZonedTime(new Date(event.start.dateTime || event.start), tz);
      end = new Date(start.getTime() + (duration > 0 ? duration : 60 * 60 * 1000));
    } else {
      // Default to 1 hour if no end
      end = new Date(start.getTime() + 60 * 60 * 1000);
    }
    // Optimistically update local state
    const prevEvents = [...events];
    setEvents(events => events.map(ev =>
      ev.id === event.id
        ? {
            ...ev,
            startTime: start.toISOString(),
            endTime: end.toISOString(),
            start: { ...ev.start, dateTime: start.toISOString() },
            end: { ...ev.end, dateTime: end.toISOString() }
          }
        : ev
    ));
    try {
      const payload = {
        summary: event.summary || event.title || '',
        description: event.description || '',
        startTime: start.toISOString(),
        endTime: end.toISOString()
      };
      await calendarAPI.updateEvent(event.id, payload);
      showToast('Event updated!', 'success');
      // Optionally reload events for full sync
      // await loadEvents();
    } catch (err) {
      setEvents(prevEvents);
      showToast('Failed to update event', 'error');
    }
  };

  // --- Events for selected range, grouped by day and hour ---
  function getTimeSlots() {
    const slots = [];
    for (let hour = 0; hour < 24; hour++) { // 12:00 AM to 11:00 PM
      for (let min = 0; min < 60; min += 15) {
        slots.push({ hour, min });
      }
    }
    return slots;
  }
  const TIME_SLOTS = getTimeSlots();

  function getRangeDays(start, end) {
    if (!start || !end) return [];
    const days = [];
    let d = new Date(start < end ? start : end);
    const last = new Date(start > end ? start : end);
    d.setHours(0, 0, 0, 0);
    last.setHours(0, 0, 0, 0);
    while (d <= last) {
      days.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }
    return days;
    }

  const ItemTypes = { EVENT: 'event' };

  // Utility to strip HTML tags from a string
  function stripHtml(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || div.innerText || '';
  }

  // Calculate event card height in px based on 64px per hour
  function getEventCardHeight(event) {
    const tz = userTimezone || detectedTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const start = toZonedTime(new Date(event.startTime || event.start?.dateTime || event.start), tz);
    const end = toZonedTime(new Date(event.endTime || event.end?.dateTime || event.end), tz);
    const durationMinutes = Math.max(15, (end - start) / (1000 * 60)); // at least 15 min
    return (durationMinutes / 60) * 64;
  }

  // Calculate top offset in px within the hour cell
  function getEventCardOffset(event) {
    const tz = userTimezone || detectedTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const start = toZonedTime(new Date(event.startTime || event.start?.dateTime || event.start), tz);
    return (start.getMinutes() / 60) * 64;
  }

  // Utility to check if two events overlap in time
  function eventsOverlap(eventA, eventB) {
    const tz = userTimezone || detectedTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const startA = toZonedTime(new Date(eventA.startTime || eventA.start?.dateTime || eventA.start), tz);
    const endA = toZonedTime(new Date(eventA.endTime || eventA.end?.dateTime || eventA.end), tz);
    const startB = toZonedTime(new Date(eventB.startTime || eventB.start?.dateTime || eventB.start), tz);
    const endB = toZonedTime(new Date(eventB.endTime || eventB.end?.dateTime || eventB.end), tz);
    return startA < endB && startB < endA;
  }

  // Utility to get all events that overlap with a given slot time
  function getOverlappingEvents(events, slotTime) {
    const tz = userTimezone || detectedTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    return events.filter(event => {
      const start = toZonedTime(new Date(event.startTime || event.start?.dateTime || event.start), tz);
      const end = toZonedTime(new Date(event.endTime || event.end?.dateTime || event.end), tz);
      return start <= slotTime && end > slotTime;
    });
    }

  function DraggableEventCard({ event, onClick, slotHeight = 64, style = {} }) {
    const [{ isDragging }, drag] = useDrag({
      type: ItemTypes.EVENT,
      item: { id: event.id, event },
      collect: (monitor) => ({
        isDragging: monitor.isDragging(),
      }),
      canDrag: () => !resizing, // Prevent drag when resizing
    });
    const [resizing, setResizing] = useState(false);
    const [resizeEnd, setResizeEnd] = useState(null);
    const [justResized, setJustResized] = useState(false); // Track if last action was resize
    
    // Get timezone and convert times
    const tz = userTimezone || detectedTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const startTime = toZonedTime(new Date(event.startTime || event.start?.dateTime || event.start), tz);
    const endTime = resizeEnd || toZonedTime(new Date(event.endTime || event.end?.dateTime || event.end), tz);
    const timeRange = `${startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} — ${endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

    // Handle resizing logic
    const cardRef = useRef();
    useEffect(() => {
      if (!resizing) return;
      
      function onMouseMove(e) {
        const cardRect = cardRef.current.getBoundingClientRect();
        const y = e.clientY - cardRect.top;
        
        // Calculate minutes based on mouse position relative to card
        const minutesFromStart = Math.max(0, y);
        const totalMinutes = Math.round(minutesFromStart / slotHeight * 60);
        
        // Snap to 15-minute intervals, minimum 15 minutes
        const snappedMinutes = Math.max(15, Math.round(totalMinutes / 15) * 15);
        
        const newEnd = new Date(startTime.getTime() + snappedMinutes * 60 * 1000);
        
        // Only update if the new end time is valid and different
        if (newEnd > startTime && (!resizeEnd || newEnd.getTime() !== resizeEnd.getTime())) {
          setResizeEnd(newEnd);
        }
      }
      
      function onMouseUp() {
        setResizing(false);
        if (resizeEnd && resizeEnd > startTime) {
          // Save new end time
          handleResizeEnd(event, resizeEnd);
          setJustResized(true); // Mark that we just resized
        }
        setResizeEnd(null);
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      }
      
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
      
      return () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };
    }, [resizing, resizeEnd, startTime, slotHeight]);

    // Only attach drag ref if not resizing
    const setRefs = node => {
      cardRef.current = node;
      if (node && !resizing) {
        drag(node);
    }
    };

    // Handle card click for overlay
    const handleCardClick = e => {
      e.stopPropagation();
      if (justResized) {
        setJustResized(false);
        return;
      }
      // Capture mouse click position and calculate optimal position
      const clickX = e.clientX;
      const clickY = e.clientY;
      const optimalPosition = calculateOptimalPosition(clickX, clickY);
      
      setOverlayPosition(optimalPosition);
      setSelectedEvent(event);
      setShowEventOverlay(true);
    };

    // Tooltip logic for truncated text
    const titleRef = useRef();
    const [showTooltip, setShowTooltip] = useState(false);
    const [isTruncated, setIsTruncated] = useState(false);
    useEffect(() => {
      if (titleRef.current) {
        setIsTruncated(titleRef.current.scrollWidth > titleRef.current.clientWidth);
      }
    }, [event.title, event.summary]);

    // Use resizeEnd for real-time height calculation during resize
    const effectiveEndTime = resizeEnd || toZonedTime(new Date(event.endTime || event.end?.dateTime || event.end), tz);
    const cardHeight = resizing 
      ? Math.max(16, ((effectiveEndTime - startTime) / (1000 * 60)) * (64 / 60)) - 4
      : getEventCardHeight(event);
    const cardOffset = getEventCardOffset(event);
    return (
      <div
        ref={setRefs}
        onClick={handleCardClick}
        className={`bg-white border border-gray-200 rounded-xl shadow-md p-2 mb-2 cursor-pointer transition-all absolute left-0
          ${isDragging ? 'opacity-40 scale-95' : ''}
          hover:shadow-xl hover:scale-[1.02] focus:shadow-xl focus:scale-[1.02] active:scale-100
          flex flex-col justify-center items-center group
          ${resizing ? 'ring-2 ring-blue-400 z-30' : ''}
        `}
        style={{
          minHeight: 16,
          height: cardHeight - 4,
          top: cardOffset,
          zIndex: resizing ? 30 : 2,
          overflow: 'visible',
          ...style,
          transition: resizing ? 'none' : 'box-shadow 0.25s cubic-bezier(.4,0,.2,1), transform 0.25s cubic-bezier(.4,0,.2,1), height 0.3s cubic-bezier(.4,0,.2,1)',
        }}
        tabIndex={0}
      >
                  <div className="flex-1 w-full flex items-center relative">
            <div
              ref={titleRef}
              className="font-semibold text-black text-sm truncate text-left w-full px-3 relative"
              onMouseEnter={() => isTruncated && setShowTooltip(true)}
              onMouseLeave={() => setShowTooltip(false)}
              style={{ cursor: isTruncated ? 'pointer' : 'default' }}
            >
              {startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}: {event.title || event.summary}
              {showTooltip && isTruncated && (
                <div className="absolute left-0 bottom-full mb-2 px-3 py-1 bg-black text-white text-xs rounded shadow-lg whitespace-nowrap z-50 pointer-events-none animate-fade-in">
                  {startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}: {event.title || event.summary}
                </div>
              )}
            </div>
          {/* Resize handle in middle - drawer style */}
          <div
            className="absolute left-1/2 -translate-x-1/2 bottom-0 w-8 h-2 flex items-center justify-center cursor-ns-resize z-20 opacity-0 hover:opacity-100 group-hover:opacity-100"
            style={{
              borderRadius: '4px 4px 0 0',
              background: resizing ? '#3b82f6' : 'rgba(75, 85, 99, 0.9)',
              boxShadow: resizing ? '0 0 0 2px #3b82f6' : '0 2px 4px 0 rgba(0,0,0,0.2)',
              transition: 'background 0.2s, box-shadow 0.2s, opacity 0.2s',
              marginBottom: '-1px',
            }}
            onMouseDown={e => {
              e.stopPropagation();
              e.preventDefault();
              setResizing(true);
            }}
            draggable={false}
            title="Drag to resize event"
          >
            <div className="w-4 h-0.5 rounded-full bg-white/80"></div>
          </div>
        </div>
      </div>
    );
  }

  // Update handleResizeEnd to reload events after resize
  async function handleResizeEnd(event, newEnd) {
    const tz = userTimezone || detectedTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const start = toZonedTime(new Date(event.startTime || event.start?.dateTime || event.start), tz);
    if (newEnd <= start) return;
    // Optimistically update local state
    const prevEvents = [...events];
    setEvents(events => events.map(ev =>
      ev.id === event.id
        ? { ...ev, endTime: newEnd.toISOString(), end: { ...ev.end, dateTime: newEnd.toISOString() } }
        : ev
    ));
    try {
      const payload = {
        summary: event.summary || event.title || '',
        description: event.description || '',
        startTime: start.toISOString(),
        endTime: newEnd.toISOString()
      };
      await calendarAPI.updateEvent(event.id, payload);
      // Optionally reload events for full sync
      // await loadEvents();
    } catch (err) {
      // Revert local change and show error
      setEvents(prevEvents);
      showToast('Failed to resize event', 'error');
      console.error('Failed to resize event', err);
    }
  }

  // Event Edit Modal
  function EventEditModal({ event, onClose, onSave }) {
    const [form, setForm] = useState({
      title: event.title || event.summary || '',
      description: event.description || '',
      start: event.start?.dateTime || event.start,
      end: event.end?.dateTime || event.end,
    });
    const [saving, setSaving] = useState(false);
    const [show, setShow] = useState(false);
    useEffect(() => { setShow(true); }, []);
    const handleChange = e => {
      const { name, value } = e.target;
      setForm(f => ({ ...f, [name]: value }));
    };
    const handleSubmit = async e => {
      e.preventDefault();
      setSaving(true);
      try {
        await onSave({ ...event, ...form });
        setShow(false);
        setTimeout(onClose, 200);
      } finally {
        setSaving(false);
      }
    };
  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-300 ${show ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
      style={{ background: 'rgba(0,0,0,0.40)' }}
    >
      <div className={`bg-white rounded-3xl shadow-xl border border-black/10 p-8 max-w-md w-full relative max-h-screen overflow-y-auto transform transition-transform duration-200 ${show ? 'scale-100' : 'scale-95'}`}
        style={{ transition: 'transform 0.2s' }}
      >
          <button
          className="absolute top-3 right-3 p-1 rounded hover:bg-gray-200"
          onClick={() => { setShow(false); setTimeout(onClose, 200); }}
          aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
        <h3 className="text-xl font-bold mb-4">Edit Event</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Title</label>
            <input
              type="text"
              name="title"
              value={form.title}
              onChange={handleChange}
              className="w-full px-3 py-2 border rounded-lg"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              className="w-full px-3 py-2 border rounded-lg"
              rows="3"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Start Time</label>
            <input
              type="datetime-local"
              name="start"
              value={form.start ? form.start.slice(0, 16) : ''}
              onChange={handleChange}
              className="w-full px-3 py-2 border rounded-lg"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">End Time</label>
            <input
              type="datetime-local"
              name="end"
              value={form.end ? form.end.slice(0, 16) : ''}
              onChange={handleChange}
              className="w-full px-3 py-2 border rounded-lg"
              required
            />
          </div>
          <div className="flex space-x-4 pt-4">
            <button
              type="button"
              onClick={() => { setShow(false); setTimeout(onClose, 200); }}
              className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800"
              disabled={saving}
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

  function TimeSlot({ day, hour, min, events, onDropEvent, slotHeight = 64, className = '' }) {
    const [{ isOver, canDrop }, drop] = useDrop({
      accept: ItemTypes.EVENT,
      drop: (item) => {
        onDropEvent(item.event, day, hour, min);
      },
      collect: (monitor) => ({
        isOver: monitor.isOver(),
        canDrop: monitor.canDrop(),
      }),
    });
    // Calculate slot time
    const slotTime = new Date(day);
    slotTime.setHours(hour, min, 0, 0);
    // Get all events that start in this hour (regardless of minutes)
    const tz = userTimezone || detectedTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const eventsInSlot = events.filter(event => {
      const start = toZonedTime(new Date(event.startTime || event.start?.dateTime || event.start), tz);
      return start.getHours() === hour; // Show all events in this hour, regardless of minutes
    });
    // Assign column index for each overlapping event (for future: overlapping logic)
    let columns = [];
    eventsInSlot.forEach(event => {
      let col = 0;
      while (columns.some(e => e.col === col && eventsOverlap(e.event, event))) {
        col++;
      }
      columns.push({ event, col });
    });
    const totalCols = columns.length > 0 ? Math.max(...columns.map(e => e.col)) + 1 : 1;
    return (
      <div
        ref={drop}
        className={`min-h-[${slotHeight}px] border-b border-gray-100 px-1 ${className} relative transition-all duration-150
          ${isOver && canDrop ? 'ring-2 ring-blue-500 bg-blue-100/40 z-20' : ''}
        `}
        style={{ position: 'relative', height: slotHeight }}
      >
        {columns.map(({ event, col }, index) => {
          const baseWidth = `${100 / totalCols}%`;
          const baseLeft = `${(100 / totalCols) * col}%`;
          // Calculate 75% of the base width and align to the left of its allocated space
          const width = `calc(${baseWidth} * 0.75)`;
          const left = baseLeft; // Align to the left instead of centering
          // Use a combination of event.id and index to ensure unique keys
          const uniqueKey = event.id || `event-${index}-${event.start?.dateTime || event.startTime || Date.now()}`;
          return (
            <DraggableEventCard
              key={uniqueKey}
              event={event}
              onClick={setEditingEvent}
              slotHeight={slotHeight}
              style={{ width, left }}
            />
          );
        })}
      </div>
    );
  }



  const handleDeleteEvent = async (eventId) => {
    try {
      // Validate eventId before making the API call
      if (!eventId) {
        showToast('Cannot delete event: Invalid event ID', 'error');
        setDeletingEvent(null);
        setShowDeleteConfirm(false);
        setShowEventOverlay(false);
        setSelectedEvent(null);
        return;
      }
      
      await calendarAPI.deleteEvent(eventId);
      showToast('Event deleted!', 'success');
      setDeletingEvent(null);
      setShowDeleteConfirm(false);
      setShowEventOverlay(false);
      setSelectedEvent(null);
      setOverlayPosition({ x: 0, y: 0 });
      // Force refresh to immediately update the UI
      await loadEvents(true);
    } catch (err) {
      showToast('Failed to delete event', 'error');
      setDeletingEvent(null);
      setShowDeleteConfirm(false);
      setShowEventOverlay(false);
      setSelectedEvent(null);
      setOverlayPosition({ x: 0, y: 0 });
      console.error('Failed to delete event', err);
    }
  };

  // --- Render ---
  return (
    <div className="bg-white/90 backdrop-blur-sm rounded-3xl shadow-xl border border-black/10 p-8 scrollbar-hover">
      <SuccessToast
        message={toast.message}
        isVisible={toast.isVisible}
        onClose={handleCloseToast}
        type={toast.type}
      />
      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && deletingEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full relative">
            <button
              className="absolute top-3 right-3 p-1 rounded hover:bg-gray-200"
              onClick={() => { setShowDeleteConfirm(false); setDeletingEvent(null); setShowEventOverlay(false); setSelectedEvent(null); setOverlayPosition({ x: 0, y: 0 }); }}
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <h3 className="text-xl font-bold mb-4 text-red-600">Delete Event</h3>
            <p className="mb-6">Are you sure you want to delete <span className="font-semibold">{deletingEvent.title || deletingEvent.summary}</span>? This action cannot be undone.</p>
            <div className="flex space-x-4 pt-2">
              <button
                onClick={() => { setShowDeleteConfirm(false); setDeletingEvent(null); setShowEventOverlay(false); setSelectedEvent(null); setOverlayPosition({ x: 0, y: 0 }); }}
                className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
              >Cancel</button>
              <button
                onClick={() => handleDeleteEvent(deletingEvent.id)}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >Delete</button>
            </div>
          </div>
        </div>
      )}
      {/* Event Overlay */}
      {showEventOverlay && selectedEvent && (
        <div className="fixed inset-0 z-50 bg-black/20">
          <div 
            className="bg-white rounded-lg shadow-2xl border border-gray-200 p-6 max-w-sm w-full relative event-overlay-container transition-all duration-200 ease-out"
            style={{
              //position: 'fixed',
              left: `${overlayPosition.x}px`,
              top: `${overlayPosition.y}px`,
              transform: 'translate(-50%, -50%)',
              maxWidth: '320px',
              zIndex: 60
            }}
            ref={() => {}}
          >
            <button
              className="absolute top-2 right-2 p-1 rounded-full hover:bg-gray-100 transition-colors"
              onClick={() => { setShowEventOverlay(false); setSelectedEvent(null); setOverlayPosition({ x: 0, y: 0 }); }}
              aria-label="Close"
            >
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            
            <div className="mb-4">
              <h3 className="text-lg font-medium mb-3 text-gray-900 leading-tight">{selectedEvent.title || selectedEvent.summary}</h3>
              <div className="text-sm text-gray-600 space-y-2">
                {(() => {
                  const tz = userTimezone || detectedTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
                  const startTime = toZonedTime(new Date(selectedEvent.startTime || selectedEvent.start?.dateTime || selectedEvent.start), tz);
                  const endTime = toZonedTime(new Date(selectedEvent.endTime || selectedEvent.end?.dateTime || selectedEvent.end), tz);
                  return (
                    <>
                      <div className="flex items-start space-x-2">
                        <svg className="w-4 h-4 mt-0.5 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div>
                          <div className="font-medium text-gray-900">
                            {startTime.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                          </div>
                          <div className="text-gray-600">
                            {startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      </div>
                      {selectedEvent.description && (
                        <div className="mt-3 pt-3 border-t border-gray-100">
                          <p className="text-sm text-gray-700 leading-relaxed">{selectedEvent.description}</p>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
            
            <div className="flex space-x-2 pt-2 border-t border-gray-100">
              <button
                onClick={() => {
                  setEditingEvent(selectedEvent);
                  setShowEventOverlay(false);
                  setSelectedEvent(null);
                  setOverlayPosition({ x: 0, y: 0 });
                }}
                className="flex-1 px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-md transition-colors flex items-center justify-center space-x-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                <span>Edit</span>
              </button>
              <button
                onClick={() => {
                  setDeletingEvent(selectedEvent);
                  setShowDeleteConfirm(true);
                  setShowEventOverlay(false);
                  setSelectedEvent(null);
                  setOverlayPosition({ x: 0, y: 0 });
                }}
                className="flex-1 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-md transition-colors flex items-center justify-center space-x-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                <span>Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-black rounded-2xl flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="text-2xl font-bold text-black">Monthly Calendar</h3>
        </div>
        <div className="flex space-x-2 items-center">
          <button
            onClick={handleManualSync}
            disabled={syncing}
            className="p-2 rounded hover:bg-gray-100 border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Sync Google Calendar"
          >
            {syncing ? (
              <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            )}
          </button>
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="p-2 rounded hover:bg-gray-100 border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Refresh Calendar"
          >
            {loading ? (
              <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="p-2 rounded hover:bg-gray-100 border border-gray-200"
            title="Calendar Settings"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          <button onClick={prevMonth} className="p-2 rounded hover:bg-gray-100">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="font-semibold text-black text-lg">
            {currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
          </span>
          <button onClick={nextMonth} className="p-2 rounded hover:bg-gray-100">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
      {error && (
        <div className="mb-6 bg-red-50/80 border border-red-200 text-red-700 px-6 py-4 rounded-2xl shadow-sm">
          <span className="font-medium">{error}</span>
        </div>
      )}
      <div ref={calendarRef} className="grid grid-cols-7 gap-1 mb-6 select-none max-w-2xl">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="text-center font-semibold text-gray-500 mb-1 text-sm">{d}</div>
        ))}
        {monthDays.map((date, idx) => (
          <div
            key={idx}
            className={`h-12 flex items-center justify-center rounded-md cursor-pointer border transition-all
              ${date ?
                isSelected(date)
                  ? 'bg-black text-white border-black scale-105 shadow-lg'
                  : (date.toDateString() === today.toDateString() ? 'border-black/40 bg-gray-100 text-black font-bold' : 'bg-white border-gray-200 text-black hover:bg-gray-50')
                : 'bg-transparent border-none cursor-default'}
            `}
            onMouseDown={date ? () => handleDayMouseDown(date) : undefined}
            onMouseEnter={date ? () => handleDayMouseEnter(date) : undefined}
            onMouseUp={date ? handleMouseUp : undefined}
            style={{ userSelect: 'none' }}
          >
            {date ? date.getDate() : ''}
          </div>
        ))}
      </div>
            {/* --- Time Grid for Selected Range --- */}
      {rangeDays.length > 0 && (
        <DndProvider backend={HTML5Backend}>
          <div className="w-full">
            <div className="w-full relative">
              {/* Flex row: left = hour labels, right = event grid. Both scroll together. */}
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
                {/* Fixed header row */}
                <div style={{ display: 'flex' }}>
                  {/* Time header */}
                  <div style={{ flex: '0 0 70px', background: '#fafafa', borderRight: '1px solid #e5e7eb' }}>
                    <div className="h-10 bg-gray-50 border-b border-gray-200 flex items-center justify-center">
                      <div className="text-xs font-medium text-gray-500">Time</div>
                    </div>
                  </div>
                  {/* Date headers */}
                  <div style={{ flex: 1, display: 'grid', gridTemplateColumns: `repeat(${rangeDays.length}, 1fr)` }}>
                    {rangeDays.map((day, colIdx) => (
                      <div key={`header-${day.toDateString()}`} className={`h-10 border-b border-gray-200 flex items-center justify-center ${rangeDays.length > 1 && colIdx % 2 === 1 ? 'bg-gray-100' : 'bg-gray-50'}`}>
                        <div className="text-sm font-semibold text-gray-700">
                          {day.toLocaleDateString('en-US', { 
                            weekday: 'short', 
                            month: 'short', 
                            day: 'numeric' 
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Scrollable content */}
                <div style={{ display: 'flex', maxHeight: 12 * 64, overflowY: 'auto' }} className="scrollbar-hover">
                  {/* Hour labels */}
                  <div style={{ flex: '0 0 70px', background: '#fafafa', borderRight: '1px solid #e5e7eb' }}>
                    {Array.from({ length: 24 }).map((_, hour) => (
                      <div
                        key={hour}
                        className="text-xs font-semibold text-gray-600 py-2 pr-2 border-b border-gray-100 text-right align-top"
                        style={{ height: 64, lineHeight: '64px' }}
                      >
                        {hour === 0 ? '12A' : hour < 12 ? `${hour}A` : hour === 12 ? '12P' : `${hour - 12}P`}
                      </div>
                    ))}
                  </div>
                  {/* Event grid (days) */}
                  <div style={{ flex: 1, display: 'grid', gridTemplateColumns: `repeat(${rangeDays.length}, 1fr)` }}>
                    {rangeDays.map((day, colIdx) => (
                      <div key={day.toDateString()} style={{ display: 'flex', flexDirection: 'column' }}>
                        {Array.from({ length: 24 }).map((_, hour) => {
                          // Only apply alternating background when multiple days are selected
                          let bg = rangeDays.length > 1 && colIdx % 2 === 1 ? 'bg-gray-100' : 'bg-white';
                          return (
                            <TimeSlot
                              key={day.toDateString() + hour}
                              day={day}
                              hour={hour}
                              min={0}
                              events={(() => {
                                const dayEvents = eventsByDayTime[day.toDateString()] || {};
                                const allDayEvents = [];
                                // Collect all events for this day
                                Object.values(dayEvents).forEach(slotEvents => {
                                  allDayEvents.push(...slotEvents);
                                });
                                return allDayEvents;
                              })()}
                              onDropEvent={handleMoveEvent}
                              slotHeight={64}
                              className={`relative ${bg} border-b border-gray-100 hover:bg-gray-50 transition-colors`}
                            />
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </DndProvider>
      )}
      {rangeDays.length === 0 && (
        <div className="text-gray-500">Select one or more days to view and manage events.</div>
      )}
      {editingEvent && (
        <EventEditModal
          event={editingEvent}
          onClose={() => setEditingEvent(null)}
          onSave={async (updatedEvent) => {
            await calendarAPI.updateEvent(updatedEvent.id, {
              summary: updatedEvent.summary || updatedEvent.title || '',
              description: updatedEvent.description || '',
              startTime: updatedEvent.start?.dateTime || updatedEvent.start || '',
              endTime: updatedEvent.end?.dateTime || updatedEvent.end || '',
              timeZone: updatedEvent.timeZone || 'UTC',
            });
            showToast('Event updated!', 'success');
            loadEvents();
          }}
        />
      )}
      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full relative">
            <button
              className="absolute top-3 right-3 p-1 rounded hover:bg-gray-200"
              onClick={() => setShowSettings(false)}
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <h3 className="text-xl font-bold mb-4">Calendar Settings</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Timezone</label>
              <select
                className="w-full px-3 py-2 border rounded-lg"
                value={userTimezone || detectedTimezone}
                onChange={e => setUserTimezone(e.target.value)}
              >
                <option value="">(Auto-detect) {detectedTimezone}</option>
                {timezones.map(tz => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
              <div className="text-xs text-gray-500 mt-1">Auto-detected: {detectedTimezone}</div>
            </div>
            {timezoneError && <div className="text-red-600 mb-2">{timezoneError}</div>}
            <div className="flex space-x-4 pt-2">
              <button
                onClick={() => setShowSettings(false)}
                className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
                disabled={savingTimezone}
              >Cancel</button>
              <button
                onClick={handleSaveTimezone}
                className="flex-1 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800"
                disabled={savingTimezone}
              >Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CalendarEvents; 