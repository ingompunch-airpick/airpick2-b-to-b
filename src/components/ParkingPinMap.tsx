import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ICN_TERMINAL_COORDS } from '../utils/airportDistance';

import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

const DEFAULT_CENTER: L.LatLngExpression = [
  ICN_TERMINAL_COORDS.T1.lat,
  ICN_TERMINAL_COORDS.T1.lng,
];

type Props = {
  lat: string;
  lng: string;
  onChange: (lat: string, lng: string) => void;
  heightClass?: string;
};

export default function ParkingPinMap({
  lat,
  lng,
  onChange,
  heightClass = 'h-48',
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: DEFAULT_CENTER,
      zoom: 13,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    map.on('click', (e: L.LeafletMouseEvent) => {
      const nextLat = e.latlng.lat.toFixed(6);
      const nextLng = e.latlng.lng.toFixed(6);
      onChangeRef.current(nextLat, nextLng);
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const latN = Number(lat);
    const lngN = Number(lng);
    if (!Number.isFinite(latN) || !Number.isFinite(lngN)) {
      if (markerRef.current) {
        map.removeLayer(markerRef.current);
        markerRef.current = null;
      }
      return;
    }

    const pos: L.LatLngExpression = [latN, lngN];
    if (!markerRef.current) {
      markerRef.current = L.marker(pos).addTo(map);
    } else {
      markerRef.current.setLatLng(pos);
    }
    map.setView(pos, Math.max(map.getZoom(), 14));
  }, [lat, lng]);

  return (
    <div
      ref={containerRef}
      className={`${heightClass} w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100 z-0`}
    />
  );
}
