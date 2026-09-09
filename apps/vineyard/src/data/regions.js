/**
 * Регіони визначають головну агротехнічну розвилку: укривна культура чи ні.
 * Від цього залежать зимові ризики, набір доступних дій і календар.
 */

export const REGIONS = {
  center: {
    id: "center",
    name: "Центр і північ України",
    subtitle: "Укривна культура",
    description:
      "Київщина, Черкащина, Полтавщина. Зими з морозами до −25 °C, тому лозу обов'язково знімають зі шпалери, пригинають і вкривають. Головні ризики — вимерзання вічок і весняні заморозки.",
    covering: "required",
    winterMinC: -25,
    springFrostRisk: 0.45,
    droughtRisk: 0.2,
    rainRisk: 0.35,
    // Довший вегетаційний період потрібен для визрівання; тут його впритул вистачає.
    seasonLength: "середній",
    harvestMonth: 9,
    startingSugar: 17,
  },

  south: {
    id: "south",
    name: "Південь України",
    subtitle: "Неукривна або частково укривна",
    description:
      "Одещина, Херсонщина, Миколаївщина. Зими м'якші, укриття здебільшого не потрібне. Натомість головні вороги — посуха, спека й потреба у зрошенні. Ягода набирає цукор легко, але може втратити кислотність.",
    covering: "optional",
    winterMinC: -16,
    springFrostRisk: 0.25,
    droughtRisk: 0.55,
    rainRisk: 0.2,
    seasonLength: "довгий",
    harvestMonth: 9,
    startingSugar: 19,
  },

  west: {
    id: "west",
    name: "Захід і Закарпаття",
    subtitle: "Частково укривна",
    description:
      "Закарпаття, Львівщина. Зими м'якші за центральні, але багато опадів і висока вологість — це найсприятливіші умови для мілдью та сірої гнилі. Захист рослин тут важливіший за все інше.",
    covering: "partial",
    winterMinC: -19,
    springFrostRisk: 0.35,
    droughtRisk: 0.1,
    rainRisk: 0.6,
    seasonLength: "середній",
    harvestMonth: 9,
    startingSugar: 18,
  },
};

export const REGION_LIST = Object.values(REGIONS);
