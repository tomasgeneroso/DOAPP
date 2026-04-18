import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { adminApi } from "@/lib/adminApi";
import { CustomDatePicker } from "@/components/ui/CustomDatePicker";
import { ArrowLeft, Search, Calendar, DollarSign, FileText, Users } from "lucide-react";

interface User {
  _id: string;
  name: string;
  email: string;
  avatar?: string;
}

interface Job {
  _id: string;
  title: string;
  client: {
    _id: string;
    name: string;
  };
  budget: number;
  status: string;
}

export default function AdminCreateContract() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // User search states
  const [clientSearchQuery, setClientSearchQuery] = useState("");
  const [doerSearchQuery, setDoerSearchQuery] = useState("");
  const [clientUsers, setClientUsers] = useState<User[]>([]);
  const [doerUsers, setDoerUsers] = useState<User[]>([]);
  const [selectedClient, setSelectedClient] = useState<User | null>(null);
  const [selectedDoer, setSelectedDoer] = useState<User | null>(null);
  const [showClientSelector, setShowClientSelector] = useState(false);
  const [showDoerSelector, setShowDoerSelector] = useState(false);

  // Job search states
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  // Form states
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    price: "",
    startDate: "",
    endDate: "",
    milestones: [] as Array<{ title: string; amount: number; description: string }>,
  });
  const [submitting, setSubmitting] = useState(false);

  // Search for clients
  useEffect(() => {
    if (clientSearchQuery.length >= 2) {
      searchClients();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientSearchQuery]);

  // Search for doers
  useEffect(() => {
    if (doerSearchQuery.length >= 2) {
      searchDoers();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doerSearchQuery]);

  // Load jobs when client is selected
  useEffect(() => {
    if (selectedClient) {
      loadClientJobs();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClient]);

  const searchClients = async () => {
    try {
      const response = await adminApi.users.list({ search: clientSearchQuery, limit: "10" });
      if (response.success && response.data) {
        setClientUsers(response.data as any || []);
      }
    } catch (error) {
      console.error("Error searching clients:", error);
    }
  };

  const searchDoers = async () => {
    try {
      const response = await adminApi.users.list({ search: doerSearchQuery, limit: "10" });
      if (response.success && response.data) {
        setDoerUsers(response.data as any || []);
      }
    } catch (error) {
      console.error("Error searching doers:", error);
    }
  };

  const loadClientJobs = async () => {
    if (!selectedClient) return;

    try {
      const response = await fetch(`/api/jobs?userId=${selectedClient._id}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });
      const data = await response.json();
      if (data.success) {
        setJobs(data.data || []);
      }
    } catch (error) {
      console.error("Error loading client jobs:", error);
    }
  };

  const addMilestone = () => {
    setFormData({
      ...formData,
      milestones: [
        ...formData.milestones,
        { title: "", amount: 0, description: "" },
      ],
    });
  };

  const updateMilestone = (index: number, field: string, value: any) => {
    const newMilestones = [...formData.milestones];
    (newMilestones[index] as any)[field] = value;
    setFormData({ ...formData, milestones: newMilestones });
  };

  const removeMilestone = (index: number) => {
    setFormData({
      ...formData,
      milestones: formData.milestones.filter((_, i) => i !== index),
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedClient) {
      alert(t('admin.contracts.mustSelectClient', 'You must select a client'));
      return;
    }

    if (!selectedDoer) {
      alert(t('admin.contracts.mustSelectDoer', 'You must select a doer'));
      return;
    }

    try {
      setSubmitting(true);

      const contractData = {
        clientId: selectedClient._id,
        doerId: selectedDoer._id,
        jobId: selectedJob?._id,
        title: formData.title || selectedJob?.title,
        description: formData.description,
        price: parseFloat(formData.price),
        startDate: formData.startDate,
        endDate: formData.endDate,
        milestones: formData.milestones,
      };

      const response = await fetch("/api/admin/contracts/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify(contractData),
      });

      const data = await response.json();

      if (data.success) {
        alert(t('admin.contracts.createdSuccessfully', 'Contract created successfully'));
        navigate("/admin/contracts");
      } else {
        alert(`Error: ${data.message}`);
      }
    } catch (error: any) {
      console.error("Error creating contract:", error);
      alert(error.message || t('admin.contracts.errorCreating', 'Error creating contract'));
    } finally {
      setSubmitting(false);
    }
  };

  const UserCard = ({ user, onRemove }: { user: User; onRemove: () => void }) => (
    <div className="flex items-center justify-between p-4 bg-green-50 dark:bg-green-900/20 border-2 border-green-500 rounded-lg">
      <div className="flex items-center gap-3">
        {user.avatar ? (
          <img src={user.avatar} alt={user.name} className="w-12 h-12 rounded-full object-cover" />
        ) : (
          <div className="w-12 h-12 bg-green-100 dark:bg-green-900/50 rounded-full flex items-center justify-center">
            <span className="text-lg font-bold text-green-600 dark:text-green-400">
              {user.name.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        <div>
          <p className="font-semibold text-gray-900 dark:text-white">{user.name}</p>
          <p className="text-sm text-gray-600 dark:text-gray-400">{user.email}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="px-4 py-2 text-sm text-green-600 dark:text-green-400 hover:bg-white dark:hover:bg-gray-700 rounded-lg transition"
      >
        {t('common.change', 'Change')}
      </button>
    </div>
  );

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate("/admin/contracts")}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
        >
          <ArrowLeft className="h-5 w-5 text-gray-600 dark:text-gray-400" />
        </button>
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            {t('admin.contracts.createTitle', 'Create Contract (Admin)')}
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            {t('admin.contracts.createSubtitle', 'Create a contract between a client and a doer')}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Client Selector */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="flex items-center gap-2 mb-4">
            <Users className="h-5 w-5 text-green-600" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {t('common.client', 'Client')}
            </h3>
          </div>

          {!selectedClient ? (
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  value={clientSearchQuery}
                  onChange={(e) => {
                    setClientSearchQuery(e.target.value);
                    setShowClientSelector(true);
                  }}
                  placeholder={t('admin.contracts.searchClientPlaceholder', 'Search client by name or email...')}
                  className="w-full pl-10 pr-4 py-3 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>

              {showClientSelector && clientUsers.length > 0 && (
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg max-h-64 overflow-y-auto">
                  {clientUsers.map((user) => (
                    <button
                      key={user._id}
                      type="button"
                      onClick={() => {
                        setSelectedClient(user);
                        setShowClientSelector(false);
                        setClientSearchQuery("");
                      }}
                      className="w-full p-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                    >
                      {user.avatar ? (
                        <img src={user.avatar} alt={user.name} className="w-10 h-10 rounded-full object-cover" />
                      ) : (
                        <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                          <span className="text-sm font-bold text-green-600 dark:text-green-400">
                            {user.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                      <div className="flex-1 text-left">
                        <p className="font-medium text-gray-900 dark:text-white">{user.name}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{user.email}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <UserCard user={selectedClient} onRemove={() => {
              setSelectedClient(null);
              setSelectedJob(null);
              setJobs([]);
            }} />
          )}
        </div>

        {/* Job Selector (Optional) */}
        {selectedClient && jobs.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              {t('admin.contracts.relatedJob', 'Related Job (Optional)')}
            </h3>
            <div className="space-y-3">
              {jobs.map((job) => (
                <button
                  key={job._id}
                  type="button"
                  onClick={() => {
                    setSelectedJob(job);
                    setFormData({ ...formData, title: job.title, price: job.budget.toString() });
                  }}
                  className={`w-full p-4 rounded-lg border-2 transition text-left ${
                    selectedJob?._id === job._id
                      ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                      : "border-gray-200 dark:border-gray-700 hover:border-gray-300"
                  }`}
                >
                  <p className="font-semibold text-gray-900 dark:text-white">{job.title}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {t('admin.contracts.budget', 'Budget')}: ${job.budget}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Doer Selector */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="flex items-center gap-2 mb-4">
            <Users className="h-5 w-5 text-green-600" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {t('admin.contracts.doerProvider', 'Doer (Provider)')}
            </h3>
          </div>

          {!selectedDoer ? (
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  value={doerSearchQuery}
                  onChange={(e) => {
                    setDoerSearchQuery(e.target.value);
                    setShowDoerSelector(true);
                  }}
                  placeholder={t('admin.contracts.searchDoerPlaceholder', 'Search doer by name or email...')}
                  className="w-full pl-10 pr-4 py-3 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>

              {showDoerSelector && doerUsers.length > 0 && (
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg max-h-64 overflow-y-auto">
                  {doerUsers.map((user) => (
                    <button
                      key={user._id}
                      type="button"
                      onClick={() => {
                        setSelectedDoer(user);
                        setShowDoerSelector(false);
                        setDoerSearchQuery("");
                      }}
                      className="w-full p-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                    >
                      {user.avatar ? (
                        <img src={user.avatar} alt={user.name} className="w-10 h-10 rounded-full object-cover" />
                      ) : (
                        <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                          <span className="text-sm font-bold text-green-600 dark:text-green-400">
                            {user.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                      <div className="flex-1 text-left">
                        <p className="font-medium text-gray-900 dark:text-white">{user.name}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{user.email}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <UserCard user={selectedDoer} onRemove={() => setSelectedDoer(null)} />
          )}
        </div>

        {/* Contract Details */}
        {selectedClient && selectedDoer && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              {t('admin.contracts.contractDetails', 'Contract Details')}
            </h3>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('admin.contracts.titleLabel', 'Title')} *
              </label>
              <input
                type="text"
                required
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-4 py-3 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder={t('admin.contracts.titlePlaceholder', 'E.g.: Website development')}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('admin.contracts.description', 'Description')}
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={4}
                className="w-full px-4 py-3 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder={t('admin.contracts.descriptionPlaceholder', 'Describe the work to be done...')}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('admin.contracts.totalPrice', 'Total Price (USD)')} *
                </label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    className="w-full pl-10 pr-4 py-3 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="100.00"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('admin.contracts.startDate', 'Start Date')} *
                </label>
                <CustomDatePicker
                  type="date"
                  required
                  value={formData.startDate ? new Date(formData.startDate) : null}
                  onChange={(date) =>
                    setFormData({ ...formData, startDate: date?.toISOString().split('T')[0] || '' })
                  }
                  placeholder={t('admin.contracts.selectStartDate', 'Select start date')}
                  minDate={new Date()}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('admin.contracts.endDate', 'End Date')} *
                </label>
                <CustomDatePicker
                  type="date"
                  required
                  value={formData.endDate ? new Date(formData.endDate) : null}
                  onChange={(date) =>
                    setFormData({ ...formData, endDate: date?.toISOString().split('T')[0] || '' })
                  }
                  placeholder={t('admin.contracts.selectEndDate', 'Select end date')}
                  minDate={formData.startDate ? new Date(formData.startDate) : new Date()}
                />
              </div>
            </div>

            {/* Milestones */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('admin.contracts.milestones', 'Milestones')}
                </label>
                <button
                  type="button"
                  onClick={addMilestone}
                  className="px-3 py-1 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
                >
                  + {t('admin.contracts.addMilestone', 'Add Milestone')}
                </button>
              </div>

              {formData.milestones.map((milestone, index) => (
                <div key={index} className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg mb-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-gray-900 dark:text-white">{t('admin.contracts.milestone', 'Milestone')} {index + 1}</h4>
                    <button
                      type="button"
                      onClick={() => removeMilestone(index)}
                      className="text-red-600 hover:text-red-700 text-sm"
                    >
                      {t('common.delete', 'Delete')}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input
                      type="text"
                      placeholder={t('admin.contracts.milestoneTitlePlaceholder', 'Milestone title')}
                      value={milestone.title}
                      onChange={(e) => updateMilestone(index, "title", e.target.value)}
                      className="px-4 py-2 bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-lg text-gray-900 dark:text-white"
                    />
                    <input
                      type="number"
                      placeholder={t('admin.contracts.milestoneAmount', 'Amount (USD)')}
                      min="0"
                      step="0.01"
                      value={milestone.amount}
                      onChange={(e) => updateMilestone(index, "amount", parseFloat(e.target.value))}
                      className="px-4 py-2 bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-lg text-gray-900 dark:text-white"
                    />
                  </div>

                  <textarea
                    placeholder={t('admin.contracts.milestoneDescriptionPlaceholder', 'Milestone description')}
                    value={milestone.description}
                    onChange={(e) => updateMilestone(index, "description", e.target.value)}
                    rows={2}
                    className="w-full px-4 py-2 bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-lg text-gray-900 dark:text-white"
                  />
                </div>
              ))}
            </div>

            {/* Submit Button */}
            <div className="flex justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={() => navigate("/admin/contracts")}
                className="px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition"
              >
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <FileText className="h-5 w-5" />
                {submitting ? t('admin.contracts.creating', 'Creating...') : t('admin.contracts.createContract', 'Create Contract')}
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
