/** Minimal NAVER Maps JS API v3 typings used by ParkingPinMap */
declare namespace naver.maps {
  class LatLng {
    constructor(lat: number, lng: number);
    lat(): number;
    lng(): number;
  }

  class Map {
    constructor(el: HTMLElement | string, options?: MapOptions);
    setCenter(latlng: LatLng): void;
    setZoom(level: number, useEffect?: boolean): void;
    getZoom(): number;
    autoResize(): void;
  }

  class Marker {
    constructor(options?: MarkerOptions);
    setMap(map: Map | null): void;
    setPosition(latlng: LatLng): void;
    getPosition(): LatLng;
  }

  class Size {
    constructor(width: number, height: number);
  }

  class Point {
    constructor(x: number, y: number);
  }

  class Event {
    static addListener(
      target: object,
      eventName: string,
      listener: (e: MapMouseEvent) => void
    ): object;
    static removeListener(listener: object): void;
  }

  interface MapOptions {
    center?: LatLng;
    zoom?: number;
    zoomControl?: boolean;
    zoomControlOptions?: { position?: Position };
    mapTypeControl?: boolean;
    scaleControl?: boolean;
  }

  interface MarkerOptions {
    position?: LatLng;
    map?: Map | null;
    title?: string;
    zIndex?: number;
  }

  interface MapMouseEvent {
    coord: LatLng;
    latlng: LatLng;
  }

  enum Position {
    TOP_LEFT,
    TOP_CENTER,
    TOP_RIGHT,
    LEFT_TOP,
    LEFT_CENTER,
    LEFT_BOTTOM,
    RIGHT_TOP,
    RIGHT_CENTER,
    RIGHT_BOTTOM,
    BOTTOM_LEFT,
    BOTTOM_CENTER,
    BOTTOM_RIGHT,
  }

  namespace Service {
    enum Status {
      OK,
      ERROR,
    }
    enum OrderType {
      LEGAL_CODE,
      ADDR,
      ROAD_ADDR,
      ADM_CODE,
    }
    function reverseGeocode(
      options: { coords: LatLng; orders?: string },
      callback: (status: Status, response: ReverseGeocodeResponse) => void
    ): void;
    function geocode(
      options: { query: string },
      callback: (status: Status, response: GeocodeResponse) => void
    ): void;
  }

  interface ReverseGeocodeResponse {
    v2?: {
      address?: {
        jibunAddress?: string;
        roadAddress?: string;
      };
      results?: Array<{
        name?: string;
        region?: Record<string, { name?: string }>;
        land?: {
          name?: string;
          number1?: string;
          number2?: string;
          addition0?: { value?: string };
        };
      }>;
    };
  }

  interface GeocodeResponse {
    v2?: {
      addresses?: Array<{
        roadAddress?: string;
        jibunAddress?: string;
        x?: string;
        y?: string;
      }>;
    };
  }
}

interface Window {
  naver?: {
    maps: typeof naver.maps;
  };
  navermap_authFailure?: () => void;
}
