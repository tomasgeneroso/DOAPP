import { useTranslation } from "react-i18next";
import { X, MessageCircle, Send } from "lucide-react";
import { getImageUrl } from "../../utils/imageUrl";

interface ShareProfileModalProps {
  open: boolean;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  results: any[];
  loading: boolean;
  sending: boolean;
  onSelectUser: (targetUser: any) => void;
  profileUser: any;
  profileUrl: string;
  onClose: () => void;
}

/** Modal to share a profile with another user (search + send). Extracted from ProfilePage. */
export default function ShareProfileModal({
  open,
  searchQuery,
  onSearchQueryChange,
  results,
  loading,
  sending,
  onSelectUser,
  profileUser,
  profileUrl,
  onClose,
}: ShareProfileModalProps) {
  const { t } = useTranslation();
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-md w-full max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">{t("common.share")}</h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Search Input */}
        <div className="p-4">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              placeholder={t("profile.searchUserPlaceholder", "Search user by name or @username...")}
              className="w-full px-4 py-3 pl-10 border border-slate-200 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
            <MessageCircle className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          </div>
        </div>

        {/* Results */}
        <div className="max-h-[300px] overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500"></div>
            </div>
          ) : results.length === 0 ? (
            <div className="text-center py-8 text-slate-500 dark:text-slate-400">
              {searchQuery.length < 2
                ? t("profile.writeAtLeast2", "Write at least 2 characters to search")
                : t("profile.noUsersFound", "No users found")}
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {results.map((targetUser) => (
                <button
                  key={targetUser.id || targetUser._id}
                  onClick={() => onSelectUser(targetUser)}
                  disabled={sending}
                  className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-left disabled:opacity-50"
                >
                  <img
                    src={getImageUrl(targetUser.avatar)}
                    alt={targetUser.name}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 dark:text-white truncate">{targetUser.name}</p>
                    {targetUser.username && (
                      <p className="text-sm text-slate-500 dark:text-slate-400">@{targetUser.username}</p>
                    )}
                  </div>
                  <Send className="w-5 h-5 text-sky-500" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Profile Preview */}
        {profileUser && (
          <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
              {t("profile.willBeShared", "Will be shared:")}
            </p>
            <div className="flex items-center gap-3">
              <img
                src={getImageUrl(profileUser.avatar)}
                alt={profileUser.name}
                className="w-12 h-12 rounded-full object-cover"
              />
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">{profileUser.name}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">{profileUrl}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
