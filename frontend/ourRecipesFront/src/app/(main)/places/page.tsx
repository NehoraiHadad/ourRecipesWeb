'use client';
export const dynamic = 'force-dynamic';


import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Container } from '@/components/ui/Container';
import { Typography } from '@/components/ui/Typography';
import Modal from '@/components/Modal';
import { PlaceCard } from '@/components/place/PlaceCard';
import { PlaceForm } from '@/components/place/PlaceForm';
import { PlaceFilters } from '@/components/place/PlaceFilters';
import { Place, PlaceFormData, getLocationParts } from '@/components/place/types';
import { filterAndSortPlaces } from '@/components/place/utils';
import Spinner from '@/components/ui/Spinner';
import { PlaceService } from '@/services/placeService';
import type { ApiResponse } from '@/types/api';
import { PlaceMap } from '@/components/place/PlaceMap';
import { ViewToggle } from '@/components/place/ViewToggle';

const INITIAL_FORM_DATA: PlaceFormData = {
  name: '',
  website: '',
  description: '',
  location: '',
  waze_link: '',
  type: 'restaurant'
};

export default function PlacesPage() {
  const [places, setPlaces] = useState<ApiResponse<Place[]> | Place[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlace, setEditingPlace] = useState<Place | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [placeToDelete, setPlaceToDelete] = useState<Place | null>(null);
  const [formData, setFormData] = useState<PlaceFormData>(INITIAL_FORM_DATA);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');

  // Filtering and sorting states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [selectedArea, setSelectedArea] = useState('');
  const [sortBy, setSortBy] = useState('newest');

  // Get unique areas from places
  const areas = isLoading || !places ? [{ value: '', label: 'כל האזורים' }] : [
    { value: '', label: 'כל האזורים' },
    ...Array.from(new Set((Array.isArray(places) ? places : places.data).map(place => {
      const locationParts = getLocationParts(place.location);
      return locationParts.area || locationParts.city;
    }).filter(Boolean))).map(area => ({
      value: area,
      label: area
    }))
  ];

  // Filter and sort places
  const filteredAndSortedPlaces = filterAndSortPlaces(
    Array.isArray(places) ? places : places.data,
    {
      searchQuery,
      selectedType,
      selectedArea,
      sortBy
    }
  );

  useEffect(() => {
    fetchPlaces();
  }, []);

  const fetchPlaces = async () => {
    try {
      setIsLoading(true);
      const response = await PlaceService.getPlaces();
      setPlaces(response);
    } catch (error) {
      console.error('Failed to load places:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      if (editingPlace) {
        await PlaceService.updatePlace(editingPlace.id, formData);
      } else {
        await PlaceService.createPlace(formData);
      }
      
      await fetchPlaces();
      setIsModalOpen(false);
      resetForm();
    } catch (error) {
      console.error('Failed to save place:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (place: Place) => {
    setPlaceToDelete(place);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!placeToDelete) return;

    try {
      await PlaceService.deletePlace(placeToDelete.id);
      await fetchPlaces();
      setIsDeleteModalOpen(false);
      setPlaceToDelete(null);
    } catch (error) {
      console.error('Failed to delete place:', error);
    }
  };

  const handleEdit = (place: Place) => {
    setEditingPlace(place);
    setFormData({
      name: place.name,
      website: place.website || '',
      description: place.description || '',
      location: place.location || '',
      waze_link: place.waze_link || '',
      type: place.type || 'restaurant'
    });
    setIsModalOpen(true);
  };

  const resetForm = () => {
    setFormData(INITIAL_FORM_DATA);
    setEditingPlace(null);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    resetForm();
  };

  const closeDeleteModal = () => {
    setIsDeleteModalOpen(false);
    setPlaceToDelete(null);
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <Container className="flex-1 flex flex-col overflow-hidden">
        <div className="flex flex-col h-full overflow-hidden">
          {/* Fixed Header */}
          <div className="flex-none">
            <div className="flex justify-between items-center p-4">
              <Typography variant="h1" className="text-2xl">מקומות מומלצים לביקור</Typography>
              <div className="flex gap-2">
                <ViewToggle view={viewMode} onChange={setViewMode} />
                <Button onClick={() => setIsModalOpen(true)} size="sm" className="md:!py-2 md:!px-4">
                  הוסף המלצה
                </Button>
              </div>
            </div>

            {/* Filters */}
            <div className="px-4 pb-4">
              <PlaceFilters
                searchQuery={searchQuery}
                selectedType={selectedType}
                selectedArea={selectedArea}
                sortBy={sortBy}
                onSearchChange={setSearchQuery}
                onTypeChange={setSelectedType}
                onAreaChange={setSelectedArea}
                onSortChange={setSortBy}
                areas={areas}
                resultsCount={filteredAndSortedPlaces.length}
              />
            </div>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto">
            <div className="px-4">
              {isLoading ? (
                <div className="flex justify-center items-center py-12">
                  <Spinner size="lg" message="טוען המלצות..." />
                </div>
              ) : (
                <>
                  {viewMode === 'list' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-4">
                      {filteredAndSortedPlaces.map((place) => (
                        <PlaceCard
                          key={place.id}
                          place={place}
                          onEdit={handleEdit}
                          onDelete={handleDelete}
                        />
                      ))}
                    </div>
                  ) : (
                    <PlaceMap places={filteredAndSortedPlaces} className="mb-4" />
                  )}

                  {filteredAndSortedPlaces.length === 0 && (
                    <div className="text-center py-12">
                      <Typography variant="h3" className="text-secondary-600">
                        לא נמצאו תוצאות
                      </Typography>
                      <Typography variant="body" className="text-secondary-500 mt-2">
                        נסה לשנות את הסינון או לחפש משהו אחר
                      </Typography>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </Container>

      {/* Add/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingPlace ? 'עריכת המלצה' : 'הוספת המלצה חדשה'}
      >
        <PlaceForm
          formData={formData}
          onSubmit={handleSubmit}
          onChange={setFormData}
          onCancel={closeModal}
          isEditing={!!editingPlace}
          isSaving={isSaving}
        />
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={closeDeleteModal}
        title="מחיקת המלצה"
      >
        <div className="space-y-4">
          <Typography variant="body">
            האם אתה בטוח שברצונך למחוק את ההמלצה ל{placeToDelete?.name}?
          </Typography>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={closeDeleteModal}
            >
              ביטול
            </Button>
            <Button
              variant="primary"
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              מחק
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
} 