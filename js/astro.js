/* 太阳视黄经低阶近似。仅供游戏交互与科普演示，正式历算以权威历书为准。 */
(function () {
  const RAD = Math.PI / 180;
  const EPS = 23.4392911;

  function mod360(value) {
    return ((value % 360) + 360) % 360;
  }

  function julianDate(date) {
    return date.getTime() / 86400000 + 2440587.5;
  }

  function solarApparentLongitude(date) {
    const t = (julianDate(date) - 2451545.0) / 36525;
    const meanLongitude = mod360(280.46646 + 36000.76983 * t + 0.0003032 * t * t);
    const meanAnomaly = mod360(357.52911 + 35999.05029 * t - 0.0001537 * t * t);
    const equation =
      (1.914602 - 0.004817 * t - 0.000014 * t * t) * Math.sin(meanAnomaly * RAD) +
      (0.019993 - 0.000101 * t) * Math.sin(2 * meanAnomaly * RAD) +
      0.000289 * Math.sin(3 * meanAnomaly * RAD);
    const trueLongitude = meanLongitude + equation;
    const omega = 125.04 - 1934.136 * t;
    const apparent = trueLongitude - 0.00569 - 0.00478 * Math.sin(omega * RAD);
    return mod360(apparent);
  }

  function solarDeclination(date) {
    const lambda = solarApparentLongitude(date) * RAD;
    return Math.asin(Math.sin(EPS * RAD) * Math.sin(lambda)) / RAD;
  }

  function currentTermIndex(date, terms) {
    const longitude = solarApparentLongitude(date);
    return Math.floor(mod360(longitude - 315) / 15) % 24;
  }

  function currentTerm(date, terms) {
    return terms[currentTermIndex(date, terms)];
  }

  function declinationText(value) {
    const direction = value >= 0 ? '北纬' : '南纬';
    return `${direction}${Math.abs(value).toFixed(1)}°`;
  }

  function longitudeText(value) {
    return `${mod360(value).toFixed(1)}°`;
  }

  function daylightTrend(value) {
    if (value > 0 && value < 180) return '北半球昼渐长';
    if (value > 180 && value < 360) return '北半球昼渐短';
    return '昼夜趋势转换';
  }

  window.SolarClock = {
    mod360,
    solarApparentLongitude,
    solarDeclination,
    currentTermIndex,
    currentTerm,
    declinationText,
    longitudeText,
    daylightTrend
  };
})();
