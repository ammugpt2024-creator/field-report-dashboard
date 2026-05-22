const WEATHER_CODE_LABELS = {
  0: 'Clear',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Drizzle',
  55: 'Dense drizzle',
  61: 'Slight rain',
  63: 'Rain',
  65: 'Heavy rain',
  71: 'Slight snow',
  73: 'Snow',
  75: 'Heavy snow',
  80: 'Rain showers',
  81: 'Rain showers',
  82: 'Heavy rain showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with hail',
  99: 'Thunderstorm with heavy hail'
};

function getWeatherLabel(code) {
  return WEATHER_CODE_LABELS[Number(code)] || 'Weather recorded';
}

function formatWeatherSummary(weatherData, sourceLabel) {
  const daily = weatherData?.daily;
  const high = daily?.temperature_2m_max?.[0];
  const low = daily?.temperature_2m_min?.[0];
  const code = daily?.weather_code?.[0];
  const label = getWeatherLabel(code);
  const highText = Number.isFinite(Number(high)) ? `${Math.round(Number(high))}°F` : 'N/A';
  const lowText = Number.isFinite(Number(low)) ? `${Math.round(Number(low))}°F` : 'N/A';
  return `${label} • High ${highText} / Low ${lowText}${sourceLabel ? ` • ${sourceLabel}` : ''}`;
}

function getBrowserPosition() {
  if (!navigator.geolocation) return Promise.resolve(null);

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          sourceLabel: 'GPS'
        }),
      () => resolve(null),
      {
        enableHighAccuracy: false,
        maximumAge: 60 * 60 * 1000,
        timeout: 3500
      }
    );
  });
}

async function geocodeProjectLocation(projectLocation) {
  const query = String(projectLocation || '').trim();
  if (!query) return null;

  const locationQuery = /united states|usa|u\.s\./i.test(query) ? query : `${query}, United States`;
  const response = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(locationQuery)}&count=1&language=en&format=json`
  );
  if (!response.ok) return null;

  const data = await response.json();
  const match = data?.results?.[0];
  if (!match) return null;

  return {
    latitude: match.latitude,
    longitude: match.longitude,
    sourceLabel: match.name ? `${match.name}${match.admin1 ? `, ${match.admin1}` : ''}` : 'Project location'
  };
}

async function requestDailyWeather({ latitude, longitude, date }) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', latitude);
  url.searchParams.set('longitude', longitude);
  url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min');
  url.searchParams.set('temperature_unit', 'fahrenheit');
  url.searchParams.set('timezone', 'auto');
  if (date) {
    url.searchParams.set('start_date', date);
    url.searchParams.set('end_date', date);
  }

  const response = await fetch(url.toString());
  if (!response.ok) throw new Error('Weather service did not return a valid response.');
  return response.json();
}

async function fetchDailyWeather({ latitude, longitude, date }) {
  try {
    return await requestDailyWeather({ latitude, longitude, date });
  } catch (error) {
    if (!date) throw error;
    return requestDailyWeather({ latitude, longitude });
  }
}

export async function getDailyWeatherSummary({ projectLocation, date, preferGps = true }) {
  const coordinates = (preferGps ? await getBrowserPosition() : null) || (await geocodeProjectLocation(projectLocation));

  if (!coordinates) {
    throw new Error('Weather location could not be determined from GPS or project location.');
  }

  const weatherData = await fetchDailyWeather({ ...coordinates, date });
  return formatWeatherSummary(weatherData, coordinates.sourceLabel);
}
