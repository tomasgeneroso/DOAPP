import React from 'react';
import { useNavigate } from 'react-router-dom';

interface AdPlaceholderProps {
  adType?: 'model1' | 'model2' | 'model3';
}

const AdPlaceholder: React.FC<AdPlaceholderProps> = ({ adType = 'model3' }) => {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate('/contact?subject=advertising');
  };

  // Ad type specific classes - matching Advertisement component
  const typeClasses = {
    model1: 'col-span-1 sm:col-span-2 lg:col-span-3 aspect-[3/1]', // Banner 3x1 - Wide banner (full width)
    model2: 'col-span-1 row-span-2 h-full', // Sidebar 1x2 - Tall sidebar (1 col, 2 rows height)
    model3: 'col-span-1 aspect-[1/1]', // Card 1x1 - Square card (same as job cards)
  };

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border-2 border-dashed border-orange-300 dark:border-orange-600 cursor-pointer bg-gradient-to-br from-orange-50 to-orange-100 dark:from-gray-800 dark:to-gray-750 hover:from-orange-100 hover:to-orange-150 dark:hover:from-gray-750 dark:hover:to-gray-700 transition-all shadow-sm hover:shadow-md ${typeClasses[adType]}`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyPress={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          handleClick();
        }
      }}
    >
      <div className={`absolute inset-0 flex ${adType === 'model1' ? 'flex-row' : 'flex-col'} items-center justify-center ${adType === 'model1' ? 'p-4 gap-4' : 'p-6'} text-center`}>
        {/* Icon */}
        <div className={adType === 'model1' ? 'flex-shrink-0' : 'mb-3'}>
          <svg
            className={`${adType === 'model1' ? 'w-10 h-10' : 'w-14 h-14'} text-orange-500 dark:text-orange-400`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"
            />
          </svg>
        </div>

        {/* Text and Button */}
        <div className={`flex ${adType === 'model1' ? 'flex-row items-center gap-3 flex-1' : 'flex-col'}`}>
          <div className={`${adType === 'model1' ? 'text-left flex-1' : ''}`}>
            {/* Text */}
            <h3 className={`${adType === 'model1' ? 'text-sm' : 'text-base'} font-bold text-gray-900 dark:text-white ${adType === 'model1' ? 'mb-0' : 'mb-1'}`}>
              Espacio Publicitario Disponible
            </h3>
            {adType !== 'model1' && (
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                Publicitá tu negocio aquí
              </p>
            )}
          </div>

          {/* Button */}
          <button className={`${adType === 'model1' ? 'px-4 py-2 text-xs flex-shrink-0' : 'px-5 py-2.5 text-sm mt-2'} bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl transition-all active:scale-95 shadow-sm hover:shadow`}>
            Contactanos
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdPlaceholder;
