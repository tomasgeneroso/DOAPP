import React, { useEffect } from 'react';

interface AdvertisementProps {
  ad: {
    _id: string;
    title: string;
    description: string;
    imageUrl: string;
    targetUrl: string;
    adType: 'model1' | 'model2' | 'model3';
  };
  onImpression?: (adId: string) => void;
  onClick?: (adId: string) => void;
}

const Advertisement: React.FC<AdvertisementProps> = ({ ad, onImpression, onClick }) => {
  // Record impression when component mounts
  useEffect(() => {
    if (onImpression) {
      onImpression(ad._id);
    }
  }, [ad._id, onImpression]);

  const handleClick = () => {
    if (onClick) {
      onClick(ad._id);
    }
    // Open target URL in new tab
    window.open(ad.targetUrl, '_blank', 'noopener,noreferrer');
  };

  // Base classes for all ad types
  const baseClasses = 'relative overflow-hidden rounded-lg shadow-md hover:shadow-xl transition-shadow duration-300 cursor-pointer bg-white dark:bg-gray-800';

  // Ad type specific classes
  const typeClasses = {
    model1: 'col-span-1 sm:col-span-2 lg:col-span-3 aspect-[3/1]', // Banner 3x1 - Wide banner (full width)
    model2: 'col-span-1 row-span-2 h-full', // Sidebar 1x2 - Tall sidebar (1 col, 2 rows height)
    model3: 'col-span-1 aspect-[1/1]', // Card 1x1 - Square card (same as job cards)
  };

  return (
    <div
      className={`${baseClasses} ${typeClasses[ad.adType]}`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyPress={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          handleClick();
        }
      }}
    >
      {/* Ad label */}
      <div className="absolute top-2 right-2 z-10">
        <span className="px-2 py-1 text-xs font-medium bg-gray-900 bg-opacity-75 text-white rounded">
          Publicidad
        </span>
      </div>

      {/* Image container */}
      <div className="relative w-full h-full">
        <img
          src={ad.imageUrl}
          alt={ad.title}
          className="w-full h-full object-cover"
        />

        {/* Darker gradient overlay for better text readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
      </div>

      {/* Content overlay - Centered */}
      <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-white">
        {/* Text container with semi-transparent background */}
        <div className="bg-black/50 backdrop-blur-sm rounded-lg px-6 py-4 max-w-[90%]">
          <h3 className={`font-bold text-center mb-2 ${ad.adType === 'model1' ? 'text-xl' : 'text-lg'}`}>
            {ad.title}
          </h3>
          {ad.adType !== 'model3' && (
            <p className="text-sm text-center opacity-95 line-clamp-2">
              {ad.description}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default Advertisement;
