import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { adminApi } from "@/lib/adminApi";
import { ArrowLeft, Send, Search, Upload, X } from "lucide-react";

interface User {
  _id: string;
  name: string;
  email: string;
  avatar?: string;
}

interface Contract {
  _id: string;
  job?: {
    _id: string;
    title: string;
  };
  jobId?: {
    title: string;
  };
  client?: {
    _id: string;
    name: string;
  };
  clientId?: {
    name: string;
  };
  doer?: {
    _id: string;
    name: string;
  };
  doerId?: {
    name: string;
  };
  price: number;
  status: string;
  startDate: string;
}

export default function AdminCreateDispute() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [users, setUsers] = useState<User[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [showUserSelector, setShowUserSelector] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    category: "payment",
    description: "",
  });
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (searchQuery.length >= 2) {
      searchUsers();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  useEffect(() => {
    if (selectedUser) {
      loadUserContracts();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUser]);

  const searchUsers = async () => {
    try {
      const response = await adminApi.users.list({ search: searchQuery, limit: "10" });
      if (response.success && response.data) {
        setUsers(response.data as any || []);
      }
    } catch (error) {
      console.error("Error searching users:", error);
    }
  };

  const loadUserContracts = async () => {
    if (!selectedUser) return;

    try {
      const response = await adminApi.contracts.list({ userId: selectedUser._id });
      if (response.success && response.data) {
        setContracts(response.data as any || []);
      }
    } catch (error) {
      console.error("Error loading contracts:", error);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setFiles([...files, ...newFiles]);
    }
  };

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedUser) {
      alert(t('admin.disputes.mustSelectUser', 'You must select a user'));
      return;
    }

    if (!selectedContract) {
      alert(t('admin.disputes.mustSelectContract', 'You must select a contract'));
      return;
    }

    try {
      setSubmitting(true);
      const formDataToSend = new FormData();
      formDataToSend.append("userId", selectedUser._id);
      formDataToSend.append("contractId", selectedContract._id);
      formDataToSend.append("title", formData.title);
      formDataToSend.append("category", formData.category);
      formDataToSend.append("description", formData.description);

      files.forEach((file) => {
        formDataToSend.append("attachments", file);
      });

      const response = await fetch("/api/admin/disputes/create", {
        method: "POST",
        credentials: "include",
        body: formDataToSend,
      });

      const data = await response.json();

      if (data.success) {
        alert(t('admin.disputes.createdSuccessfully', 'Dispute created successfully'));
        navigate("/admin/disputes");
      } else {
        alert(`Error: ${data.message}`);
      }
    } catch (error: any) {
      console.error("Error creating dispute:", error);
      alert(error.message || t('admin.disputes.errorCreating', 'Error creating dispute'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate("/admin")}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
        >
          <ArrowLeft className="h-5 w-5 text-gray-600 dark:text-gray-400" />
        </button>
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            {t('admin.disputes.createDispute', 'Create Dispute (Admin)')}
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            {t('admin.disputes.createOnBehalf', 'Create a dispute on behalf of a user')}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* User Selector */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            {t('admin.disputes.selectUser', 'Select User')}
          </h3>

          {!selectedUser ? (
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setShowUserSelector(true);
                  }}
                  placeholder={t('admin.disputes.searchUserPlaceholder', 'Search user by name or email...')}
                  className="w-full pl-10 pr-4 py-3 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                />
              </div>

              {showUserSelector && users.length > 0 && (
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg max-h-64 overflow-y-auto">
                  {users.map((user) => (
                    <button
                      key={user._id}
                      type="button"
                      onClick={() => {
                        setSelectedUser(user);
                        setShowUserSelector(false);
                        setSearchQuery("");
                      }}
                      className="w-full p-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                    >
                      {user.avatar ? (
                        <img
                          src={user.avatar}
                          alt={user.name}
                          className="w-10 h-10 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center">
                          <span className="text-sm font-bold text-orange-600 dark:text-orange-400">
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
            <div className="flex items-center justify-between p-4 bg-orange-50 dark:bg-orange-900/20 border-2 border-orange-500 rounded-lg">
              <div className="flex items-center gap-3">
                {selectedUser.avatar ? (
                  <img
                    src={selectedUser.avatar}
                    alt={selectedUser.name}
                    className="w-12 h-12 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/50 rounded-full flex items-center justify-center">
                    <span className="text-lg font-bold text-orange-600 dark:text-orange-400">
                      {selectedUser.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">
                    {selectedUser.name}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {selectedUser.email}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedUser(null);
                  setSelectedContract(null);
                  setContracts([]);
                }}
                className="px-4 py-2 text-sm text-orange-600 dark:text-orange-400 hover:bg-white dark:hover:bg-gray-700 rounded-lg transition"
              >
                {t('common.change', 'Change')}
              </button>
            </div>
          )}
        </div>

        {/* Contract Selector */}
        {selectedUser && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              {t('admin.disputes.selectContract', 'Select Contract')}
            </h3>

            {contracts.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-center py-4">
                {t('admin.disputes.noActiveContracts', 'This user has no active contracts')}
              </p>
            ) : (
              <div className="space-y-3">
                {contracts.map((contract) => (
                  <button
                    key={contract._id}
                    type="button"
                    onClick={() => setSelectedContract(contract)}
                    className={`w-full p-4 rounded-lg border-2 transition text-left ${
                      selectedContract?._id === contract._id
                        ? "border-orange-500 bg-orange-50 dark:bg-orange-900/20"
                        : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-semibold text-gray-900 dark:text-white">
                          {contract.job?.title || contract.jobId?.title || t('admin.contracts.untitledContract', 'Untitled contract')}
                        </p>
                        <div className="flex items-center gap-4 mt-2 text-sm text-gray-600 dark:text-gray-400">
                          <span>{t('admin.contracts.client', 'Client')}: {contract.client?.name || contract.clientId?.name || 'N/A'}</span>
                          <span>•</span>
                          <span>{t('admin.contracts.provider', 'Provider')}: {contract.doer?.name || contract.doerId?.name || 'N/A'}</span>
                          <span>•</span>
                          <span className="font-semibold">${contract.price}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <span
                            className={`text-xs px-2 py-1 rounded-full ${
                              contract.status === "in_progress"
                                ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                                : contract.status === "completed"
                                ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                                : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                            }`}
                          >
                            {contract.status}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {t('admin.contracts.start', 'Start')}: {new Date(contract.startDate).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Dispute Form */}
        {selectedUser && selectedContract && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              {t('admin.disputes.disputeDetails', 'Dispute Details')}
            </h3>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('admin.disputes.title', 'Title')} *
              </label>
              <input
                type="text"
                required
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-4 py-3 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                placeholder={t('admin.disputes.titlePlaceholder', 'e.g.: Issue with work delivery')}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('admin.disputes.category', 'Category')} *
              </label>
              <select
                required
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-4 py-3 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              >
                <option value="payment">{t('admin.disputes.categories.payment', 'Payment')}</option>
                <option value="quality">{t('admin.disputes.categories.quality', 'Work Quality')}</option>
                <option value="delivery">{t('admin.disputes.categories.delivery', 'Delivery')}</option>
                <option value="communication">{t('admin.disputes.categories.communication', 'Communication')}</option>
                <option value="terms">{t('admin.disputes.categories.terms', 'Contract Terms')}</option>
                <option value="other">{t('admin.disputes.categories.other', 'Other')}</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('common.description', 'Description')} *
              </label>
              <textarea
                required
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={6}
                className="w-full px-4 py-3 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                placeholder={t('admin.disputes.descriptionPlaceholder', 'Describe the issue in detail...')}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('admin.disputes.attachments', 'Attachments (Optional)')}
              </label>
              <div className="space-y-3">
                <div className="flex items-center justify-center w-full">
                  <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 dark:border-gray-600 border-dashed rounded-lg cursor-pointer bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <Upload className="h-8 w-8 text-gray-400 mb-2" />
                      <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">
                        <span className="font-semibold">{t('common.clickToUpload', 'Click to upload')}</span> {t('common.orDragFiles', 'or drag files')}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        PNG, JPG, PDF, MP4 (MAX. 50MB)
                      </p>
                    </div>
                    <input
                      type="file"
                      multiple
                      onChange={handleFileChange}
                      className="hidden"
                      accept="image/*,video/*,.pdf"
                    />
                  </label>
                </div>

                {files.length > 0 && (
                  <div className="space-y-2">
                    {files.map((file, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
                      >
                        <span className="text-sm text-gray-900 dark:text-white truncate">
                          {file.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeFile(index)}
                          className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition"
                        >
                          <X className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={() => navigate("/admin")}
                className="px-6 py-3 border-2 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition font-semibold"
              >
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 px-6 py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition font-semibold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="h-5 w-5" />
                {submitting ? t('admin.disputes.creating', 'Creating...') : t('admin.disputes.createDisputeBtn', 'Create Dispute')}
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
