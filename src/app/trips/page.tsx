'use client';

import React, { useState, useEffect, useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import Modal from '@/components/ui/Modal';
import {
  Plane,
  Plus,
  Calendar,
  DollarSign,
  MapPin,
  TrendingUp,
  Clock,
  CheckCircle2,
  Play,
  StopCircle,
  Edit2,
  Trash2,
  Tag,
  ArrowUpRight,
  Sparkles,
  PieChart,
  ListFilter,
  Search,
} from 'lucide-react';
import {
  getTrips,
  addTrip,
  updateTrip,
  deleteTrip,
  getActiveTrip,
  setActiveTrip,
  getTripSummary,
  getAccounts,
  getCategories,
  saveTransaction,
  type Trip,
  type Transaction,
} from '@/lib/storage';
import { toast } from 'sonner';

export default function TripsPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [activeTripState, setActiveTripState] = useState<Trip | null>(null);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'planned' | 'completed'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal States
  const [isTripModalOpen, setIsTripModalOpen] = useState(false);
  const [editingTrip, setEditingTrip] = useState<Trip | null>(null);

  // Trip Form fields
  const [tripName, setTripName] = useState('');
  const [tripDestination, setTripDestination] = useState('');
  const [tripStartDate, setTripStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [tripEndDate, setTripEndDate] = useState('');
  const [tripBudget, setTripBudget] = useState('');
  const [tripDescription, setTripDescription] = useState('');
  const [tripStatus, setTripStatus] = useState<'active' | 'planned' | 'completed'>('planned');
  const [tripIcon, setTripIcon] = useState('✈️');

  // Quick Add Expense to Trip Modal
  const [isAddExpenseModalOpen, setIsAddExpenseModalOpen] = useState(false);
  const [expenseDesc, setExpenseDesc] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseCategory, setExpenseCategory] = useState('');
  const [expenseSubcategory, setExpenseSubcategory] = useState('');
  const [expenseAccount, setExpenseAccount] = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));

  const accounts = useMemo(() => getAccounts(), []);
  const categories = useMemo(() => getCategories(), []);

  const refreshTrips = () => {
    const loadedTrips = getTrips();
    setTrips(loadedTrips);
    const active = getActiveTrip();
    setActiveTripState(active);
    if (!selectedTripId && loadedTrips.length > 0) {
      setSelectedTripId(active?.id || loadedTrips[0].id);
    }
  };

  useEffect(() => {
    refreshTrips();
  }, []);

  useEffect(() => {
    if (categories.length > 0 && !expenseCategory) {
      setExpenseCategory(categories[0].name);
    }
    if (accounts.length > 0 && !expenseAccount) {
      setExpenseAccount(accounts[0].id);
    }
  }, [categories, accounts]);

  const handleOpenCreateModal = () => {
    setEditingTrip(null);
    setTripName('');
    setTripDestination('');
    setTripStartDate(new Date().toISOString().slice(0, 10));
    setTripEndDate('');
    setTripBudget('');
    setTripDescription('');
    setTripStatus(trips.some((t) => t.status === 'active') ? 'planned' : 'active');
    setTripIcon('✈️');
    setIsTripModalOpen(true);
  };

  const handleOpenEditModal = (trip: Trip) => {
    setEditingTrip(trip);
    setTripName(trip.name);
    setTripDestination(trip.destination || '');
    setTripStartDate(trip.startDate || new Date().toISOString().slice(0, 10));
    setTripEndDate(trip.endDate || '');
    setTripBudget(trip.budget ? String(trip.budget) : '');
    setTripDescription(trip.description || '');
    setTripStatus(trip.status);
    setTripIcon(trip.icon || '✈️');
    setIsTripModalOpen(true);
  };

  const handleSaveTrip = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tripName.trim()) {
      toast.error('Trip Name is required');
      return;
    }

    const payload = {
      name: tripName.trim(),
      destination: tripDestination.trim(),
      startDate: tripStartDate,
      endDate: tripEndDate || undefined,
      budget: parseFloat(tripBudget) || undefined,
      description: tripDescription.trim(),
      status: tripStatus,
      icon: tripIcon,
    };

    if (editingTrip) {
      updateTrip(editingTrip.id, payload);
      toast.success('Trip updated successfully');
    } else {
      const created = addTrip(payload);
      setSelectedTripId(created.id);
      toast.success('Trip created! Any new expenses will now log under this trip.');
    }

    setIsTripModalOpen(false);
    refreshTrips();
  };

  const handleToggleActivate = (tripId: string, currentStatus: string) => {
    if (currentStatus === 'active') {
      setActiveTrip(null);
      toast.info('Trip mode deactivated');
    } else {
      setActiveTrip(tripId);
      setSelectedTripId(tripId);
      toast.success('Trip mode activated! New transactions will automatically link to this trip.');
    }
    refreshTrips();
  };

  const handleDeleteTrip = (tripId: string) => {
    if (confirm('Are you sure you want to delete this trip? Recorded expenses will remain in transactions.')) {
      deleteTrip(tripId);
      toast.success('Trip deleted');
      if (selectedTripId === tripId) {
        setSelectedTripId(null);
      }
      refreshTrips();
    }
  };

  const handleAddExpenseToTrip = (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseAmount || !expenseAccount || !expenseCategory) {
      toast.error('Please fill in amount, category, and account');
      return;
    }

    const targetTripId = selectedTripId || activeTripState?.id;
    saveTransaction({
      description: expenseDesc.trim() || expenseCategory || 'Trip Expense',
      amount: parseFloat(expenseAmount),
      category: expenseCategory,
      subcategory: expenseSubcategory || undefined,
      account: expenseAccount,
      type: 'expense',
      date: expenseDate,
      tripId: targetTripId || undefined,
    });

    toast.success('Expense added to trip!');
    setExpenseDesc('');
    setExpenseAmount('');
    setExpenseSubcategory('');
    setIsAddExpenseModalOpen(false);
    refreshTrips();
  };

  const filteredTrips = useMemo(() => {
    return trips.filter((t) => {
      const matchesStatus = filterStatus === 'all' || t.status === filterStatus;
      const matchesSearch =
        t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.destination && t.destination.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesStatus && matchesSearch;
    });
  }, [trips, filterStatus, searchQuery]);

  const currentSummary = useMemo(() => {
    if (!selectedTripId) return null;
    return getTripSummary(selectedTripId);
  }, [selectedTripId, trips]);

  const iconsList = ['✈️', '🏖️', '🏔️', '🚘', '🏕️', '🚢', '🎟️', '🧳', '🌴', '🏙️'];

  return (
    <AppLayout>
      <div className="space-y-6 pb-12">
        {/* Top Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card border border-border rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
              <Plane size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Trips & Travel Expenses</h1>
              <p className="text-sm text-muted-foreground">
                Track travel budgets, live trip spending, and categorized vacation expenses.
              </p>
            </div>
          </div>
          <button
            onClick={handleOpenCreateModal}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground font-semibold text-sm rounded-lg hover:bg-primary/90 transition shadow-sm"
          >
            <Plus size={16} />
            Start New Trip
          </button>
        </div>

        {/* Active Trip Live Banner */}
        {activeTripState ? (
          <div className="relative overflow-hidden bg-gradient-to-r from-primary/20 via-card to-card border border-primary/30 rounded-2xl p-6 shadow-md">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{activeTripState.icon || '✈️'}</span>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-primary text-primary-foreground uppercase tracking-wider animate-pulse">
                    Live Trip Active
                  </span>
                </div>
                <h2 className="text-2xl font-black text-foreground">{activeTripState.name}</h2>
                {activeTripState.destination && (
                  <p className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                    <MapPin size={14} className="text-primary" /> {activeTripState.destination}
                  </p>
                )}
                <p className="text-xs text-muted-foreground flex items-center gap-2">
                  <Calendar size={13} /> {activeTripState.startDate}
                  {activeTripState.endDate ? ` to ${activeTripState.endDate}` : ' (Ongoing)'}
                </p>
              </div>

              {/* Active Trip Quick Stats */}
              {(() => {
                const summary = getTripSummary(activeTripState.id);
                return (
                  <div className="flex flex-wrap items-center gap-6 bg-background/60 backdrop-blur-md p-4 rounded-xl border border-border">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase">Total Spent</p>
                      <p className="text-xl font-black text-foreground">₹{summary.totalExpense.toLocaleString('en-IN')}</p>
                    </div>
                    {summary.budget > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase">Budget Left</p>
                        <p
                          className={`text-xl font-black ${
                            summary.remainingBudget >= 0 ? 'text-positive' : 'text-negative'
                          }`}
                        >
                          ₹{summary.remainingBudget.toLocaleString('en-IN')}
                        </p>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setSelectedTripId(activeTripState.id);
                          setIsAddExpenseModalOpen(true);
                        }}
                        className="px-3.5 py-2 bg-primary text-primary-foreground font-semibold text-xs rounded-lg hover:bg-primary/90 transition shadow"
                      >
                        + Add Expense
                      </button>
                      <button
                        onClick={() => handleToggleActivate(activeTripState.id, 'active')}
                        className="px-3.5 py-2 bg-muted hover:bg-muted/80 text-foreground font-semibold text-xs rounded-lg transition"
                      >
                        Stop Trip Mode
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        ) : (
          <div className="bg-card border border-dashed border-border rounded-2xl p-6 text-center space-y-2">
            <div className="w-10 h-10 mx-auto rounded-full bg-muted flex items-center justify-center text-muted-foreground">
              <Play size={18} />
            </div>
            <p className="text-sm font-semibold text-foreground">No Active Trip Running</p>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              Activate a trip when going on a vacation or event. All transactions you record will automatically be tracked under that trip!
            </p>
          </div>
        )}

        {/* Trips Grid & Detailed View Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Trips List */}
          <div className="lg:col-span-5 space-y-4">
            {/* Search & Filter Controls */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-3 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search trips..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-muted/40 border border-border rounded-lg text-sm focus:outline-none focus:border-primary text-foreground"
                />
              </div>

              <div className="flex items-center gap-1 overflow-x-auto pb-1">
                {(['all', 'active', 'planned', 'completed'] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => setFilterStatus(st)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider capitalize transition flex-shrink-0 ${
                      filterStatus === st
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            {/* Trip Cards */}
            {filteredTrips.length === 0 ? (
              <div className="bg-card border border-border rounded-xl p-8 text-center space-y-3">
                <Plane size={32} className="mx-auto text-muted-foreground opacity-50" />
                <p className="text-sm font-medium text-muted-foreground">No trips found</p>
                <button
                  onClick={handleOpenCreateModal}
                  className="text-xs font-bold text-primary hover:underline"
                >
                  Create your first trip
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredTrips.map((trip) => {
                  const summary = getTripSummary(trip.id);
                  const isSelected = selectedTripId === trip.id;
                  const isActive = trip.status === 'active';

                  return (
                    <div
                      key={trip.id}
                      onClick={() => setSelectedTripId(trip.id)}
                      className={`cursor-pointer bg-card border rounded-xl p-4 transition-all duration-150 relative ${
                        isSelected
                          ? 'border-primary shadow-sm bg-primary/5'
                          : 'border-border hover:border-muted-foreground/30'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{trip.icon || '✈️'}</span>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-bold text-base text-foreground">{trip.name}</h3>
                              {isActive && (
                                <span className="w-2 h-2 rounded-full bg-primary animate-ping" />
                              )}
                            </div>
                            {trip.destination && (
                              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                <MapPin size={12} /> {trip.destination}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenEditModal(trip);
                            }}
                            title="Edit Trip"
                            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteTrip(trip.id);
                            }}
                            title="Delete Trip"
                            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-negative transition"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      {/* Dates & Budget progress */}
                      <div className="mt-3 pt-3 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar size={12} /> {trip.startDate}
                        </span>
                        <div className="text-right">
                          <span className="font-bold text-foreground">
                            ₹{summary.totalExpense.toLocaleString('en-IN')}
                          </span>
                          {trip.budget ? (
                            <span className="text-muted-foreground font-medium">
                              {' '}
                              / ₹{trip.budget.toLocaleString('en-IN')}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      {/* Status Toggle Button */}
                      <div className="mt-3 flex items-center justify-between">
                        <span
                          className={`text-2xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                            isActive
                              ? 'bg-primary/20 text-primary'
                              : trip.status === 'completed'
                                ? 'bg-positive/20 text-positive'
                                : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {trip.status}
                        </span>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleActivate(trip.id, trip.status);
                          }}
                          className={`text-xs font-semibold flex items-center gap-1 px-2.5 py-1 rounded-md transition ${
                            isActive
                              ? 'bg-negative/10 text-negative hover:bg-negative/20'
                              : 'bg-primary/10 text-primary hover:bg-primary/20'
                          }`}
                        >
                          {isActive ? (
                            <>
                              <StopCircle size={12} /> Deactivate
                            </>
                          ) : (
                            <>
                              <Play size={12} /> Set Active
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Column: Selected Trip Details & Breakdown */}
          <div className="lg:col-span-7 space-y-6">
            {currentSummary && currentSummary.trip ? (
              <div className="space-y-6">
                {/* Trip Header Card */}
                <div className="bg-card border border-border rounded-xl p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-3xl">{currentSummary.trip.icon || '✈️'}</span>
                        <div>
                          <h2 className="text-xl font-black text-foreground">{currentSummary.trip.name}</h2>
                          {currentSummary.trip.destination && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <MapPin size={13} className="text-primary" /> {currentSummary.trip.destination}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => setIsAddExpenseModalOpen(true)}
                      className="px-4 py-2 bg-primary text-primary-foreground font-bold text-xs rounded-lg hover:bg-primary/90 transition shadow-sm flex items-center gap-1.5 justify-center"
                    >
                      <Plus size={14} /> Add Trip Expense
                    </button>
                  </div>

                  {currentSummary.trip.description && (
                    <p className="text-xs text-muted-foreground bg-muted/40 p-3 rounded-lg border border-border">
                      {currentSummary.trip.description}
                    </p>
                  )}

                  {/* Summary Metrics */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
                    <div className="bg-muted/30 p-3 rounded-lg border border-border">
                      <p className="text-2xs font-semibold text-muted-foreground uppercase">Total Expenses</p>
                      <p className="text-lg font-black text-negative mt-0.5">
                        ₹{currentSummary.totalExpense.toLocaleString('en-IN')}
                      </p>
                    </div>

                    <div className="bg-muted/30 p-3 rounded-lg border border-border">
                      <p className="text-2xs font-semibold text-muted-foreground uppercase">Trip Budget</p>
                      <p className="text-lg font-black text-foreground mt-0.5">
                        {currentSummary.budget > 0
                          ? `₹${currentSummary.budget.toLocaleString('en-IN')}`
                          : 'No Budget Set'}
                      </p>
                    </div>

                    <div className="bg-muted/30 p-3 rounded-lg border border-border col-span-2 sm:col-span-1">
                      <p className="text-2xs font-semibold text-muted-foreground uppercase">Remaining</p>
                      <p
                        className={`text-lg font-black mt-0.5 ${
                          currentSummary.budget > 0
                            ? currentSummary.remainingBudget >= 0
                              ? 'text-positive'
                              : 'text-negative'
                            : 'text-muted-foreground'
                        }`}
                      >
                        {currentSummary.budget > 0
                          ? `₹${currentSummary.remainingBudget.toLocaleString('en-IN')}`
                          : 'N/A'}
                      </p>
                    </div>
                  </div>

                  {/* Budget Utilization Progress Bar */}
                  {currentSummary.budget > 0 && (
                    <div className="space-y-1.5 pt-2">
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-muted-foreground">Budget Used</span>
                        <span
                          className={
                            currentSummary.budgetUtilization > 90
                              ? 'text-negative font-bold'
                              : 'text-foreground'
                          }
                        >
                          {currentSummary.budgetUtilization}%
                        </span>
                      </div>
                      <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            currentSummary.budgetUtilization > 90
                              ? 'bg-negative'
                              : currentSummary.budgetUtilization > 75
                                ? 'bg-warning'
                                : 'bg-primary'
                          }`}
                          style={{ width: `${Math.min(100, currentSummary.budgetUtilization)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Expense Breakdown by Category */}
                <div className="bg-card border border-border rounded-xl p-5 space-y-4">
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <PieChart size={16} className="text-primary" /> Category Spending Breakdown
                  </h3>

                  {currentSummary.categoryBreakdown.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">
                      No expenses logged for this trip yet.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {currentSummary.categoryBreakdown.map((item) => {
                        const pct = currentSummary.totalExpense > 0
                          ? Math.round((item.amount / currentSummary.totalExpense) * 100)
                          : 0;

                        return (
                          <div key={item.category} className="space-y-1 text-xs">
                            <div className="flex justify-between items-center font-semibold">
                              <span className="flex items-center gap-1.5 text-foreground">
                                <span>{item.icon}</span> {item.category}
                              </span>
                              <span className="text-foreground">
                                ₹{item.amount.toLocaleString('en-IN')}{' '}
                                <span className="text-muted-foreground font-normal">({pct}%)</span>
                              </span>
                            </div>
                            <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${pct}%`, backgroundColor: item.color }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Trip Transactions List */}
                <div className="bg-card border border-border rounded-xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                      <ListFilter size={16} className="text-primary" /> Trip Transactions (
                      {currentSummary.transactions.length})
                    </h3>
                  </div>

                  {currentSummary.transactions.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-6 text-center">
                      No transactions recorded under this trip yet. Add an expense or record a transaction while Trip mode is active.
                    </p>
                  ) : (
                    <div className="divide-y divide-border">
                      {currentSummary.transactions.map((txn) => (
                        <div key={txn.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-foreground truncate">{txn.notes || txn.category}</p>
                            <p className="text-2xs text-muted-foreground mt-0.5 truncate">
                              {txn.category} • {txn.date ? txn.date.slice(0, 10) : ''}
                            </p>
                          </div>
                          <div className="text-right font-black text-negative shrink-0">
                            -₹{Number(txn.amount).toLocaleString('en-IN')}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-card border border-border rounded-xl p-12 text-center space-y-3">
                <Plane size={40} className="mx-auto text-muted-foreground opacity-30" />
                <p className="text-sm font-bold text-foreground">Select a trip to view details</p>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  Click on any trip from the list on the left to see category breakdowns, expenses, and budgets.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* CREATE / EDIT TRIP MODAL */}
      <Modal
        isOpen={isTripModalOpen}
        onClose={() => setIsTripModalOpen(false)}
        title={editingTrip ? 'Edit Trip' : 'Start New Trip'}
      >
        <form onSubmit={handleSaveTrip} className="space-y-4 text-sm font-semibold">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Trip Name *</label>
            <input
              type="text"
              placeholder="e.g. Goa Vacation, Business Trip to Mumbai"
              value={tripName}
              onChange={(e) => setTripName(e.target.value)}
              className="w-full px-3 py-2 bg-muted/40 border border-border rounded-lg text-foreground focus:outline-none focus:border-primary"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Destination</label>
              <input
                type="text"
                placeholder="e.g. Goa, India"
                value={tripDestination}
                onChange={(e) => setTripDestination(e.target.value)}
                className="w-full px-3 py-2 bg-muted/40 border border-border rounded-lg text-foreground focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Icon / Emoji</label>
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {iconsList.map((ic) => (
                  <button
                    type="button"
                    key={ic}
                    onClick={() => setTripIcon(ic)}
                    className={`text-lg p-1.5 rounded-lg border transition ${
                      tripIcon === ic ? 'border-primary bg-primary/10' : 'border-transparent hover:bg-muted'
                    }`}
                  >
                    {ic}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Start Date</label>
              <input
                type="date"
                value={tripStartDate}
                onChange={(e) => setTripStartDate(e.target.value)}
                className="w-full px-3 py-2 bg-muted/40 border border-border rounded-lg text-foreground focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">End Date (Optional)</label>
              <input
                type="date"
                value={tripEndDate}
                onChange={(e) => setTripEndDate(e.target.value)}
                className="w-full px-3 py-2 bg-muted/40 border border-border rounded-lg text-foreground focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Trip Budget (₹)</label>
              <input
                type="number"
                placeholder="e.g. 25000"
                value={tripBudget}
                onChange={(e) => setTripBudget(e.target.value)}
                className="w-full px-3 py-2 bg-muted/40 border border-border rounded-lg text-foreground focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Status</label>
              <select
                value={tripStatus}
                onChange={(e) => setTripStatus(e.target.value as any)}
                className="w-full px-3 py-2 bg-muted/40 border border-border rounded-lg text-foreground focus:outline-none focus:border-primary"
              >
                <option value="active">Active (Live Mode)</option>
                <option value="planned">Planned</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-muted-foreground mb-1">Description / Notes</label>
            <textarea
              placeholder="Add notes, itinerary details..."
              value={tripDescription}
              onChange={(e) => setTripDescription(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 bg-muted/40 border border-border rounded-lg text-foreground focus:outline-none focus:border-primary"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsTripModalOpen(false)}
              className="px-4 py-2 bg-muted text-muted-foreground rounded-lg font-semibold text-xs hover:bg-muted/80 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-semibold text-xs hover:bg-primary/90 transition shadow-sm"
            >
              {editingTrip ? 'Save Changes' : 'Start Trip'}
            </button>
          </div>
        </form>
      </Modal>

      {/* QUICK ADD EXPENSE TO TRIP MODAL */}
      <Modal
        isOpen={isAddExpenseModalOpen}
        onClose={() => setIsAddExpenseModalOpen(false)}
        title="Add Expense to Trip"
      >
        <form onSubmit={handleAddExpenseToTrip} className="space-y-4 text-sm font-semibold">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Description (Optional)</label>
            <input
              type="text"
              value={expenseDesc}
              onChange={(e) => setExpenseDesc(e.target.value)}
              className="w-full px-3 py-2 bg-muted/40 border border-border rounded-lg text-foreground focus:outline-none focus:border-primary"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Amount (₹) *</label>
              <input
                type="number"
                placeholder="0.00"
                value={expenseAmount}
                onChange={(e) => setExpenseAmount(e.target.value)}
                className="w-full px-3 py-2 bg-muted/40 border border-border rounded-lg text-foreground focus:outline-none focus:border-primary"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Date</label>
              <input
                type="date"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                className="w-full px-3 py-2 bg-muted/40 border border-border rounded-lg text-foreground focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          {/* Category Dropdown (Clean, No Icons, No Subcategories) */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-muted-foreground uppercase mb-1">Category</label>
            <select
              value={expenseCategory}
              onChange={(e) => {
                setExpenseCategory(e.target.value);
                setExpenseSubcategory('');
              }}
              className="w-full px-3 py-2 bg-muted/40 border border-border rounded-lg text-foreground focus:outline-none focus:border-primary text-xs"
            >
              <option value="">Select Category</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.name}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-muted-foreground mb-1">Account</label>
            <select
              value={expenseAccount}
              onChange={(e) => setExpenseAccount(e.target.value)}
              className="w-full px-3 py-2 bg-muted/40 border border-border rounded-lg text-foreground focus:outline-none focus:border-primary"
            >
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.icon || '🏦'} {acc.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsAddExpenseModalOpen(false)}
              className="px-4 py-2 bg-muted text-muted-foreground rounded-lg font-semibold text-xs hover:bg-muted/80 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-semibold text-xs hover:bg-primary/90 transition shadow-sm"
            >
              Add Expense
            </button>
          </div>
        </form>
      </Modal>
    </AppLayout>
  );
}
