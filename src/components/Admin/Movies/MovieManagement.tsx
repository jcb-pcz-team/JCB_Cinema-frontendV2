import React, { useState } from 'react';
import { TableLayout } from '../TableLayout/TableLayout';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { sortItems, type SortConfig } from '../../../utils/sorting.ts';

interface Genre {
    genreId: number;
    genreName: string;
}

interface MovieResponse {
    movieId: number;
    title: string;
    description: string;
    duration: number;
    releaseDate: string;
    genre: Genre;
    normalizedTitle: string;
    release: string;
}

interface MovieCreateForm {
    title: string;
    description: string;
    duration: number;
    releaseDate: string;
    genre: string;
    posterDescription: string;
    posterFile?: File;
}

const INITIAL_MOVIE_FORM: MovieCreateForm = {
    title: '',
    description: '',
    duration: 120,
    releaseDate: new Date().toISOString().split('T')[0],
    genre: '',
    posterDescription: '',
};

const api = {
    fetchMovies: async () => {
        const token = localStorage.getItem('authToken');
        if (!token) throw new Error('Not authenticated');

        const response = await fetch('https://localhost:7101/api/movies', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) throw new Error('Failed to fetch movies');

        const data: MovieResponse[] = await response.json();
        return data.map(movie => ({
            id: movie.movieId,
            title: movie.title,
            description: movie.description,
            duration: movie.duration,
            releaseDate: movie.releaseDate,
            genre: movie.genre.genreName
        }));
    },

    addMovie: async (data: MovieCreateForm) => {
        const token = localStorage.getItem('authToken');
        if (!token) throw new Error('Not authenticated');

        // Build query parameters
        const url = new URL('https://localhost:7101/api/movies/add');
        url.searchParams.append('Title', data.title);
        url.searchParams.append('Description', data.description);
        url.searchParams.append('Duration', data.duration.toString());
        url.searchParams.append('ReleaseDate', data.releaseDate);
        url.searchParams.append('Genre', data.genre);
        url.searchParams.append('PosterDescription', data.posterDescription);

        console.log('Request URL:', url.toString());

        // Create FormData for file upload
        const formData = new FormData();
        if (data.posterFile) {
            formData.append('PosterFile', data.posterFile);
        }

        try {
            const response = await fetch(url.toString(), {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            console.log('Response status:', response.status);
            const responseText = await response.text();
            console.log('Response text:', responseText);

            if (!response.ok) {
                if (responseText) {
                    try {
                        const errorData = JSON.parse(responseText);
                        if (errorData.errors) {
                            const messages = Object.entries(errorData.errors)
                                .map(([field, msgs]) => `${field}: ${(msgs as string[]).join(', ')}`)
                                .join('; ');
                            throw new Error(messages);
                        }
                        throw new Error(errorData.title || 'Failed to add movie');
                    } catch (e) {
                        throw new Error(responseText || 'Failed to add movie');
                    }
                }
                throw new Error('Failed to add movie');
            }

            // Only try to parse JSON if we have content
            if (responseText) {
                try {
                    return JSON.parse(responseText);
                } catch (e) {
                    console.log('Response was not JSON but operation might have succeeded');
                    return { success: true };
                }
            }

            return { success: true };
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    },
    deleteMovie: async (id: number) => {
        const token = localStorage.getItem('authToken');
        if (!token) throw new Error('Not authenticated');

        const response = await fetch(`https://localhost:7101/api/movies/delete/${id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            const text = await response.text();
            try {
                const errorData = JSON.parse(text);
                throw new Error(errorData.title || 'Failed to delete movie');
            } catch (e) {
                throw new Error('Failed to delete movie');
            }
        }

        return true;
    }
};

export const MovieManagement: React.FC = () => {
    const [isFormVisible, setIsFormVisible] = useState(false);
    const [formData, setFormData] = useState<MovieCreateForm>(INITIAL_MOVIE_FORM);
    const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);

    const queryClient = useQueryClient();

    const { data: movies = [], isLoading, error } = useQuery({
        queryKey: ['movies'],
        queryFn: api.fetchMovies
    });

    const sortedMovies = sortItems(movies, sortConfig);

    const handleSort = (sortKey: string) => {
        setSortConfig(current => {
            if (!current || current.key !== sortKey) {
                return { key: sortKey, direction: 'asc' };
            }
            if (current.direction === 'asc') {
                return { key: sortKey, direction: 'desc' };
            }
            return null;
        });
    };

    const addMovieMutation = useMutation({
        mutationFn: api.addMovie,
        onSuccess: (data) => {
            console.log('Mutation success:', data);
            queryClient.invalidateQueries({ queryKey: ['movies'] });
            setIsFormVisible(false);
            setFormData(INITIAL_MOVIE_FORM);
            alert('Movie added successfully!');
        },
        onError: (error: Error) => {
            console.error('Mutation error:', error);
            alert(error.message);
        }
    });

    const deleteMovieMutation = useMutation({
        mutationFn: api.deleteMovie,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['movies'] });
            alert('Movie deleted successfully!');
        },
        onError: (error: Error) => {
            console.error('Delete error:', error);
            alert(error.message);
        }
    });

    const handleDelete = (id: number) => {
        if (window.confirm('Are you sure you want to delete this movie?')) {
            deleteMovieMutation.mutate(id);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        console.log('Submitting form data:', formData);
        addMovieMutation.mutate(formData);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: name === 'duration' ? parseInt(value) : value
        }));
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files && files.length > 0) {
            const file = files[0];
            setFormData(prev => ({
                ...prev,
                posterFile: file
            }));
        }
    };

    if (isLoading) return <div>Loading...</div>;
    if (error) return <div>Error: {(error as Error).message}</div>;

    return (
        <TableLayout
            title="Movies Management"
            onSearch={() => {}}
            onSort={() => {}}
            sortOptions={[
                { value: 'title', label: 'Title' },
                { value: 'releaseDate', label: 'Release Date' }
            ]}
            onAddNew={() => setIsFormVisible(true)}
        >
            {isFormVisible && (
                <div className="form-container">
                    <h3>Add New Movie</h3>
                    <form onSubmit={handleSubmit} className="form">
                        <div className="form-grid">
                            <div className="form-group">
                                <label htmlFor="title">Title</label>
                                <input
                                    id="title"
                                    name="title"
                                    type="text"
                                    value={formData.title}
                                    onChange={handleInputChange}
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label htmlFor="description">Description</label>
                                <textarea
                                    id="description"
                                    name="description"
                                    value={formData.description}
                                    onChange={handleInputChange}
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label htmlFor="duration">Duration (minutes)</label>
                                <input
                                    id="duration"
                                    name="duration"
                                    type="number"
                                    value={formData.duration}
                                    onChange={handleInputChange}
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label htmlFor="releaseDate">Release Date</label>
                                <input
                                    id="releaseDate"
                                    name="releaseDate"
                                    type="date"
                                    value={formData.releaseDate}
                                    onChange={handleInputChange}
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label htmlFor="genre">Genre</label>
                                <select
                                    id="genre"
                                    name="genre"
                                    value={formData.genre}
                                    onChange={handleInputChange}
                                    required
                                >
                                    <option value="">Select genre</option>
                                    <option value="Action">Action</option>
                                    <option value="Adventure">Adventure</option>
                                    <option value="Comedy">Comedy</option>
                                    <option value="Drama">Drama</option>
                                    <option value="Horror">Horror</option>
                                    <option value="Thriller">Thriller</option>
                                    <option value="Science Fiction">Science Fiction</option>
                                    <option value="Fantasy">Fantasy</option>
                                    <option value="Animation">Animation</option>
                                    <option value="Documentary">Documentary</option>
                                    <option value="Crime">Crime</option>
                                    <option value="Romance">Romance</option>
                                    <option value="Musical">Musical</option>
                                    <option value="War">War</option>
                                    <option value="Spy">Spy</option>
                                </select>
                            </div>

                            <div className="form-group">
                                <label htmlFor="posterDescription">Poster Description</label>
                                <textarea
                                    id="posterDescription"
                                    name="posterDescription"
                                    value={formData.posterDescription}
                                    onChange={handleInputChange}
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label htmlFor="posterFile">Poster File</label>
                                <input
                                    id="posterFile"
                                    name="posterFile"
                                    type="file"
                                    onChange={handleFileChange}
                                    accept="image/*"
                                />
                            </div>
                        </div>

                        <div className="form-buttons">
                            <button
                                type="submit"
                                className="button button--primary"
                                disabled={addMovieMutation.isPending}
                            >
                                {addMovieMutation.isPending ? 'Adding...' : 'Add Movie'}
                            </button>
                            <button
                                type="button"
                                className="button button--secondary"
                                onClick={() => setIsFormVisible(false)}
                                disabled={addMovieMutation.isPending}
                            >
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <div className="table-container">
                <table className="admin-table">
                    <thead>
                    <tr>
                        <th onClick={() => handleSort('title')} style={{cursor: 'pointer'}}>
                            Title {sortConfig?.key === 'title' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                        </th>
                        <th onClick={() => handleSort('description')} style={{cursor: 'pointer'}}>
                            Description {sortConfig?.key === 'description' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                        </th>
                        <th onClick={() => handleSort('duration')} style={{cursor: 'pointer'}}>
                            Duration {sortConfig?.key === 'duration' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                        </th>
                        <th onClick={() => handleSort('releaseDate')} style={{cursor: 'pointer'}}>
                            Release
                            Date {sortConfig?.key === 'releaseDate' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                        </th>
                        <th onClick={() => handleSort('genre')} style={{cursor: 'pointer'}}>
                            Genre {sortConfig?.key === 'genre' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                        </th>
                        <th>Actions</th>
                    </tr>
                    </thead>
                    <tbody>
                    {sortedMovies.map((movie) => (
                        <tr key={movie.id}>
                            <td>{movie.title}</td>
                            <td>{movie.description}</td>
                            <td>{movie.duration} min</td>
                            <td>{movie.releaseDate}</td>
                            <td>{movie.genre}</td>
                            <td>
                                <div className="admin-table__actions">
                                    <button
                                        className="button button--edit"
                                        // onClick={() => handleEdit(movie)}
                                        // disabled={updateMovieMutation.isPending}
                                    >
                                        Edit
                                    </button>
                                    <button
                                        className="button button--delete"
                                        onClick={() => handleDelete(movie.id)}
                                        disabled={deleteMovieMutation.isPending}
                                    >
                                        {deleteMovieMutation.isPending ? 'Deleting...' : 'Delete'}
                                    </button>
                                </div>
                            </td>
                        </tr>
                    ))}
                    </tbody>
                </table>
            </div>
        </TableLayout>
    );
};