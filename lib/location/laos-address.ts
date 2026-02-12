export type LaosProvince = {
  id: number;
  nameLo: string;
  nameEn: string;
};

export type LaosDistrict = {
  id: number;
  provinceId: number;
  nameLo: string;
  nameEn: string;
};

export type LaosAddressSelection = {
  provinceId: number | null;
  districtId: number | null;
  detail: string;
};

export const laosProvinces: LaosProvince[] = [
  { id: 1, nameLo: "ນະຄອນຫລວງວຽງຈັນ", nameEn: "Vientiane capital" },
  { id: 2, nameLo: "ຜົ້ງສາລີ", nameEn: "Phongsali" },
  { id: 3, nameLo: "ຫລວງນ້ຳທາ", nameEn: "Louang Namtha" },
  { id: 4, nameLo: "ອຸດົມໄຊ", nameEn: "Oudomxai" },
  { id: 5, nameLo: "ບໍ່ແກ້ວ", nameEn: "Bokeo" },
  { id: 6, nameLo: "ຫຼວງພະບາງ", nameEn: "Louang Phabang" },
  { id: 7, nameLo: "ຫົວພັນ", nameEn: "Houaphan" },
  { id: 8, nameLo: "ໄຊຍະບູລີ", nameEn: "Xaignabouli" },
  { id: 9, nameLo: "ຊຽງຂວາງ", nameEn: "Xiangkhoang" },
  { id: 10, nameLo: "ວຽງຈັນ", nameEn: "Vientiane" },
  { id: 11, nameLo: "ບໍລິຄຳໄຊ", nameEn: "Boli khamxai" },
  { id: 12, nameLo: "ຄຳມ່ວນ", nameEn: "Khammouan" },
  { id: 13, nameLo: "ສະຫວັນນະເຂດ", nameEn: "Savannakhet" },
  { id: 14, nameLo: "ສາລະວັນ", nameEn: "Salavan" },
  { id: 15, nameLo: "ເຊກອງ", nameEn: "Xekong" },
  { id: 16, nameLo: "ຈຳປາສັກ", nameEn: "Champasak" },
  { id: 17, nameLo: "ອັດຕະປື", nameEn: "Attapu" },
  { id: 18, nameLo: "ໄຊສົມບູນ", nameEn: "Sisomboun" },
];

export const laosDistricts: LaosDistrict[] = [
  { id: 101, nameLo: "ຈັນທະບູລີ", nameEn: "Chanthabuly", provinceId: 1 },
  { id: 102, nameLo: "ສີໂຄດຕະບອງ", nameEn: "Sikhottabong", provinceId: 1 },
  { id: 103, nameLo: "ໄຊເສດຖາ", nameEn: "Xaysetha", provinceId: 1 },
  { id: 104, nameLo: "ສີສັດຕະນາກ", nameEn: "Sisattanak", provinceId: 1 },
  { id: 105, nameLo: "ນາຊາຍທອງ", nameEn: "Naxaithong", provinceId: 1 },
  { id: 106, nameLo: "ໄຊທານີ", nameEn: "Xaythany", provinceId: 1 },
  { id: 107, nameLo: "ຫາດຊາຍຟອງ", nameEn: "Hadxaifong", provinceId: 1 },
  { id: 108, nameLo: "ສັງທອງ", nameEn: "Sangthong", provinceId: 1 },
  { id: 109, nameLo: "ປາກງື່ມ", nameEn: "Parkngum", provinceId: 1 },
  { id: 201, nameLo: "ຜົ້ງສາລີ", nameEn: "Phongsaly", provinceId: 2 },
  { id: 202, nameLo: "ໃຫມ່", nameEn: "May", provinceId: 2 },
  { id: 203, nameLo: "ຂວາ", nameEn: "Khua", provinceId: 2 },
  { id: 204, nameLo: "ສຳພັນ", nameEn: "Samphanh", provinceId: 2 },
  { id: 205, nameLo: "ບູນເຫນືອ", nameEn: "Bounneua", provinceId: 2 },
  { id: 206, nameLo: "ຍອດອູ", nameEn: "Nhot ou", provinceId: 2 },
  { id: 207, nameLo: "ບູນໃຕ້", nameEn: "Boontai", provinceId: 2 },
  { id: 301, nameLo: "ຫລວງນ້ຳທາ", nameEn: "Luangnamtha", provinceId: 3 },
  { id: 302, nameLo: "ສິງ", nameEn: "Sing", provinceId: 3 },
  { id: 303, nameLo: "ລອງ", nameEn: "Long", provinceId: 3 },
  { id: 304, nameLo: "ວຽງພູຄາ", nameEn: "Viengphoukha", provinceId: 3 },
  { id: 305, nameLo: "ນາແລ", nameEn: "Nalae", provinceId: 3 },
  { id: 401, nameLo: "ໄຊ", nameEn: "Xay", provinceId: 4 },
  { id: 402, nameLo: "ຫລາ", nameEn: "La", provinceId: 4 },
  { id: 403, nameLo: "ນາໝໍ້", nameEn: "Namor", provinceId: 4 },
  { id: 404, nameLo: "ງາ", nameEn: "Nga", provinceId: 4 },
  { id: 405, nameLo: "ແບງ", nameEn: "Beng", provinceId: 4 },
  { id: 406, nameLo: "ຮຸນ", nameEn: "Hoon", provinceId: 4 },
  { id: 407, nameLo: "ປາກແບງ", nameEn: "Pakbeng", provinceId: 4 },
  { id: 501, nameLo: "ຫ້ວຍຊາຍ", nameEn: "Houixay", provinceId: 5 },
  { id: 502, nameLo: "ຕົ້ນເຜິ້ງ", nameEn: "Tongpheung", provinceId: 5 },
  { id: 503, nameLo: "ເມິງ", nameEn: "Meung", provinceId: 5 },
  { id: 504, nameLo: "ຜາອຸດົມ", nameEn: "Phaoudom", provinceId: 5 },
  { id: 505, nameLo: "ປາກທາ", nameEn: "Paktha", provinceId: 5 },
  { id: 601, nameLo: "ຫຼວງພະບາງ", nameEn: "Luangprabang", provinceId: 6 },
  { id: 602, nameLo: "ຊຽງເງິນ", nameEn: "Xiengngeun", provinceId: 6 },
  { id: 603, nameLo: "ນານ", nameEn: "Nan", provinceId: 6 },
  { id: 604, nameLo: "ປາກອູ", nameEn: "Parkou", provinceId: 6 },
  { id: 605, nameLo: "ນ້ຳບາກ", nameEn: "Nambak", provinceId: 6 },
  { id: 606, nameLo: "ງອຍ", nameEn: "Ngoi", provinceId: 6 },
  { id: 607, nameLo: "ປາກແຊງ", nameEn: "Pakxeng", provinceId: 6 },
  { id: 608, nameLo: "ໂພນໄຊ", nameEn: "Phonxay", provinceId: 6 },
  { id: 609, nameLo: "ຈອມເພັດ", nameEn: "Chomphet", provinceId: 6 },
  { id: 610, nameLo: "ວຽງຄຳ", nameEn: "Viengkham", provinceId: 6 },
  { id: 611, nameLo: "ພູຄູນ", nameEn: "Phoukhoune", provinceId: 6 },
  { id: 612, nameLo: "ໂພນທອງ", nameEn: "Phonthong", provinceId: 6 },
  { id: 701, nameLo: "ຊຳເໜືອ", nameEn: "Xamneua", provinceId: 7 },
  { id: 702, nameLo: "ຊຽງຄໍ້", nameEn: "Xiengkhor", provinceId: 7 },
  { id: 703, nameLo: "ຮ້ຽມ", nameEn: "Hiam", provinceId: 7 },
  { id: 704, nameLo: "ວຽງໄຊ", nameEn: "Viengxay", provinceId: 7 },
  { id: 705, nameLo: "ຫົວເມືອງ", nameEn: "Huameuang", provinceId: 7 },
  { id: 706, nameLo: "ຊຳໃຕ້", nameEn: "Xamtay", provinceId: 7 },
  { id: 707, nameLo: "ສົບເບົາ", nameEn: "Sopbao", provinceId: 7 },
  { id: 708, nameLo: "ແອດ", nameEn: "Add", provinceId: 7 },
  { id: 709, nameLo: "ກວັນ", nameEn: "Kuan", provinceId: 7 },
  { id: 710, nameLo: "ຊອນ", nameEn: "Xone", provinceId: 7 },
  { id: 801, nameLo: "ໄຊຍະບູລີ", nameEn: "Xayabury", provinceId: 8 },
  { id: 802, nameLo: "ຄອບ", nameEn: "Khop", provinceId: 8 },
  { id: 803, nameLo: "ຫົງສາ", nameEn: "Hongsa", provinceId: 8 },
  { id: 804, nameLo: "ເງິນ", nameEn: "Ngeun", provinceId: 8 },
  { id: 805, nameLo: "ຊຽງຮ່ອນ", nameEn: "Xienghone", provinceId: 8 },
  { id: 806, nameLo: "ພຽງ", nameEn: "Phieng", provinceId: 8 },
  { id: 807, nameLo: "ປາກລາຍ", nameEn: "Parklai", provinceId: 8 },
  { id: 808, nameLo: "ແກ່ນທ້າວ", nameEn: "Kenethao", provinceId: 8 },
  { id: 809, nameLo: "ບໍ່ແຕນ", nameEn: "Botene", provinceId: 8 },
  { id: 810, nameLo: "ທົ່ງມີໄຊ", nameEn: "Thongmyxay", provinceId: 8 },
  { id: 811, nameLo: "ໄຊຊະຖານ", nameEn: "Xaysathan", provinceId: 8 },
  { id: 901, nameLo: "ແປກ", nameEn: "Pek", provinceId: 9 },
  { id: 902, nameLo: "ຄຳ", nameEn: "Kham", provinceId: 9 },
  { id: 903, nameLo: "ໜອງແຮດ", nameEn: "Nonghed", provinceId: 9 },
  { id: 904, nameLo: "ຄູນ", nameEn: "Khoune", provinceId: 9 },
  { id: 905, nameLo: "ໝອກ", nameEn: "Mork", provinceId: 9 },
  { id: 906, nameLo: "ພູກູດ", nameEn: "Phookood", provinceId: 9 },
  { id: 907, nameLo: "ຜາໄຊ", nameEn: "Phaxay", provinceId: 9 },
  { id: 1001, nameLo: "ໂພນໂຮງ", nameEn: "Phonhong", provinceId: 10 },
  { id: 1002, nameLo: "ທຸລະຄົມ", nameEn: "Thoulakhom", provinceId: 10 },
  { id: 1003, nameLo: "ແກ້ວອຸດົມ", nameEn: "Keooudom", provinceId: 10 },
  { id: 1004, nameLo: "ກາສີ", nameEn: "Kasy", provinceId: 10 },
  { id: 1005, nameLo: "ວັງວຽງ", nameEn: "Vangvieng", provinceId: 10 },
  { id: 1006, nameLo: "ເຟືອງ", nameEn: "Feuang", provinceId: 10 },
  { id: 1007, nameLo: "ຊະນະຄາມ", nameEn: "Xanakham", provinceId: 10 },
  { id: 1008, nameLo: "ແມດ", nameEn: "Mad", provinceId: 10 },
  { id: 1009, nameLo: "ວຽງຄຳ", nameEn: "Viengkham", provinceId: 10 },
  { id: 1010, nameLo: "ຫີນເຫີບ", nameEn: "Hinherb", provinceId: 10 },
  { id: 1012, nameLo: "ໝື່ນ", nameEn: "Meun", provinceId: 10 },
  { id: 1101, nameLo: "ປາກຊັນ", nameEn: "Pakxane", provinceId: 11 },
  { id: 1102, nameLo: "ທ່າພະບາດ", nameEn: "Thaphabath", provinceId: 11 },
  { id: 1103, nameLo: "ປາກກະດິງ", nameEn: "Pakkading", provinceId: 11 },
  { id: 1104, nameLo: "ບໍລິຄັນ", nameEn: "Bolikhanh", provinceId: 11 },
  { id: 1105, nameLo: "ຄຳເກີດ", nameEn: "Khamkheuth", provinceId: 11 },
  { id: 1106, nameLo: "ວຽງທອງ", nameEn: "Viengthong", provinceId: 11 },
  { id: 1107, nameLo: "ໄຊຈຳພອນ", nameEn: "Xaychamphone", provinceId: 11 },
  { id: 1201, nameLo: "ທ່າແຂກ", nameEn: "Thakhek", provinceId: 12 },
  { id: 1202, nameLo: "ມະຫາໄຊ", nameEn: "Mahaxay", provinceId: 12 },
  { id: 1203, nameLo: "ໜອງບົກ", nameEn: "Nongbok", provinceId: 12 },
  { id: 1204, nameLo: "ຫີນບູນ", nameEn: "Hinboon", provinceId: 12 },
  { id: 1205, nameLo: "ຍົມມະລາດ", nameEn: "Nhommalath", provinceId: 12 },
  { id: 1206, nameLo: "ບົວລະພາ", nameEn: "Bualapha", provinceId: 12 },
  { id: 1207, nameLo: "ນາກາຍ", nameEn: "Nakai", provinceId: 12 },
  { id: 1208, nameLo: "ເຊບັ້ງໄຟ", nameEn: "Xebangfay", provinceId: 12 },
  { id: 1209, nameLo: "ໄຊບົວທອງ", nameEn: "Xaybuathong", provinceId: 12 },
  { id: 1210, nameLo: "ຄູນຄຳ", nameEn: "Khounkham", provinceId: 12 },
  { id: 1301, nameLo: "ໄກສອນ ພົມວິຫານ", nameEn: "Kaisone Phomvihane", provinceId: 13 },
  { id: 1302, nameLo: "ອຸທຸມພອນ", nameEn: "Outhoumphone", provinceId: 13 },
  { id: 1303, nameLo: "ອາດສະພັງທອງ", nameEn: "Atsaphangthong", provinceId: 13 },
  { id: 1304, nameLo: "ພີນ", nameEn: "Phine", provinceId: 13 },
  { id: 1305, nameLo: "ເຊໂປນ", nameEn: "Xepon", provinceId: 13 },
  { id: 1306, nameLo: "ນອງ", nameEn: "Nong", provinceId: 13 },
  { id: 1307, nameLo: "ທ່າປາງທອງ", nameEn: "Thapangthong", provinceId: 13 },
  { id: 1308, nameLo: "ສອງຄອນ", nameEn: "Songkhone", provinceId: 13 },
  { id: 1309, nameLo: "ຈຳພອນ", nameEn: "Champhone", provinceId: 13 },
  { id: 1310, nameLo: "ຊົນບູລີ", nameEn: "Xonbuly", provinceId: 13 },
  { id: 1311, nameLo: "ໄຊບູລີ", nameEn: "Xaybouly", provinceId: 13 },
  { id: 1312, nameLo: "ວິລະບູລີ", nameEn: "Vilabuly", provinceId: 13 },
  { id: 1313, nameLo: "ອາດສະພອນ", nameEn: "Atsaphone", provinceId: 13 },
  { id: 1314, nameLo: "ໄຊພູທອງ", nameEn: "Xayphoothong", provinceId: 13 },
  { id: 1315, nameLo: "ພະລານໄຊ", nameEn: "Phalanxay", provinceId: 13 },
  { id: 1401, nameLo: "ສາລະວັນ", nameEn: "Saravane", provinceId: 14 },
  { id: 1402, nameLo: "ຕາໂອ້ຍ", nameEn: "Ta oi", provinceId: 14 },
  { id: 1403, nameLo: "ຕຸ້ມລານ", nameEn: "Toomlam", provinceId: 14 },
  { id: 1404, nameLo: "ລະຄອນເພັງ", nameEn: "Lakhonepheng", provinceId: 14 },
  { id: 1405, nameLo: "ວາປີ", nameEn: "Vapy", provinceId: 14 },
  { id: 1406, nameLo: "ຄົງເຊໂດນ", nameEn: "Kongxedone", provinceId: 14 },
  { id: 1407, nameLo: "ເລົ່າງາມ", nameEn: "Lao ngarm", provinceId: 14 },
  { id: 1408, nameLo: "ສະມ້ວຍ", nameEn: "Samoi", provinceId: 14 },
  { id: 1501, nameLo: "ລະມາມ", nameEn: "Lamarm", provinceId: 15 },
  { id: 1502, nameLo: "ກະລືມ", nameEn: "Kaleum", provinceId: 15 },
  { id: 1503, nameLo: "ດາກຈຶງ", nameEn: "Dakcheung", provinceId: 15 },
  { id: 1504, nameLo: "ທ່າແຕງ", nameEn: "Thateng", provinceId: 15 },
  { id: 1601, nameLo: "ປາກເຊ", nameEn: "Pakse", provinceId: 16 },
  { id: 1602, nameLo: "ຊະນະສົມບູນ", nameEn: "Sanasomboon", provinceId: 16 },
  { id: 1603, nameLo: "ບາຈຽງຈະເລີນສຸກ", nameEn: "Bachiangchaleunsook", provinceId: 16 },
  { id: 1604, nameLo: "ປາກຊ່ອງ", nameEn: "Pakxong", provinceId: 16 },
  { id: 1605, nameLo: "ປະທຸມພອນ", nameEn: "Pathoumphone", provinceId: 16 },
  { id: 1606, nameLo: "ໂພນທອງ", nameEn: "Phonthong", provinceId: 16 },
  { id: 1607, nameLo: "ຈຳປາສັກ", nameEn: "Champasak", provinceId: 16 },
  { id: 1608, nameLo: "ສຸຂຸມາ", nameEn: "Sukhuma", provinceId: 16 },
  { id: 1609, nameLo: "ມຸນລະປະໂມກ", nameEn: "Moonlapamok", provinceId: 16 },
  { id: 1610, nameLo: "ໂຂງ", nameEn: "Khong", provinceId: 16 },
  { id: 1701, nameLo: "ໄຊເສດຖາ", nameEn: "Xaysettha", provinceId: 17 },
  { id: 1702, nameLo: "ສາມະຄີໄຊ", nameEn: "Samakkixay", provinceId: 17 },
  { id: 1703, nameLo: "ສະໜາມໄຊ", nameEn: "Sanamxay", provinceId: 17 },
  { id: 1704, nameLo: "ສານໄຊ", nameEn: "Sanxay", provinceId: 17 },
  { id: 1705, nameLo: "ພູວົງ", nameEn: "Phouvong", provinceId: 17 },
  { id: 1801, nameLo: "ອານຸວົງ", nameEn: "Anouvong", provinceId: 18 },
  { id: 1802, nameLo: "ທ່າໂທມ", nameEn: "Thathom", provinceId: 18 },
  { id: 1803, nameLo: "ລ້ອງແຈ້ງ", nameEn: "Longcheng", provinceId: 18 },
  { id: 1804, nameLo: "ຮົ່ມ", nameEn: "Hom", provinceId: 18 },
  { id: 1805, nameLo: "ລ້ອງຊານ", nameEn: "Longsan", provinceId: 18 },
];

const provincesById = new Map(laosProvinces.map((item) => [item.id, item]));
const districtsById = new Map(laosDistricts.map((item) => [item.id, item]));

const districtsByProvinceId = new Map<number, LaosDistrict[]>();
for (const district of laosDistricts) {
  const current = districtsByProvinceId.get(district.provinceId);
  if (current) {
    current.push(district);
  } else {
    districtsByProvinceId.set(district.provinceId, [district]);
  }
}

for (const list of districtsByProvinceId.values()) {
  list.sort((a, b) => a.nameLo.localeCompare(b.nameLo));
}

export function createEmptyLaosAddressSelection(): LaosAddressSelection {
  return {
    provinceId: null,
    districtId: null,
    detail: "",
  };
}

export function getProvinceById(provinceId: number | null | undefined) {
  return provinceId ? provincesById.get(provinceId) ?? null : null;
}

export function getDistrictById(districtId: number | null | undefined) {
  return districtId ? districtsById.get(districtId) ?? null : null;
}

export function getDistrictsByProvinceId(provinceId: number | null | undefined): LaosDistrict[] {
  if (!provinceId) {
    return [];
  }

  return districtsByProvinceId.get(provinceId) ?? [];
}

function normalizeLookupKey(value: string) {
  return value.trim().toLowerCase();
}

function findProvinceByLabel(label: string): LaosProvince | null {
  const normalizedLabel = normalizeLookupKey(
    label.replace(/^ແຂວງ\s+/, "").replace(/^province\s+/i, ""),
  );

  return (
    laosProvinces.find(
      (province) =>
        normalizeLookupKey(province.nameLo) === normalizedLabel ||
        normalizeLookupKey(province.nameEn) === normalizedLabel,
    ) ?? null
  );
}

function findDistrictByLabel(label: string): LaosDistrict | null {
  const normalizedLabel = normalizeLookupKey(
    label.replace(/^ເມືອງ\s+/, "").replace(/^district\s+/i, ""),
  );

  return (
    laosDistricts.find(
      (district) =>
        normalizeLookupKey(district.nameLo) === normalizedLabel ||
        normalizeLookupKey(district.nameEn) === normalizedLabel,
    ) ?? null
  );
}

export function parseLaosAddress(value: string | null | undefined): LaosAddressSelection {
  const normalizedValue = value?.trim() ?? "";
  if (!normalizedValue) {
    return createEmptyLaosAddressSelection();
  }

  let provinceId: number | null = null;
  let districtId: number | null = null;
  const detailParts: string[] = [];

  for (const part of normalizedValue.split(",").map((item) => item.trim())) {
    if (!part) {
      continue;
    }

    const province = findProvinceByLabel(part);
    if (province) {
      provinceId = province.id;
      continue;
    }

    const district = findDistrictByLabel(part);
    if (district) {
      districtId = district.id;
      continue;
    }

    detailParts.push(part);
  }

  if (districtId) {
    const district = getDistrictById(districtId);
    if (district) {
      if (!provinceId) {
        provinceId = district.provinceId;
      } else if (district.provinceId !== provinceId) {
        districtId = null;
      }
    }
  }

  return {
    provinceId,
    districtId,
    detail: detailParts.join(", "),
  };
}

export function hasAnyLaosAddressInput(selection: LaosAddressSelection): boolean {
  return (
    selection.provinceId !== null ||
    selection.districtId !== null ||
    selection.detail.trim().length > 0
  );
}

export function isLaosAddressComplete(selection: LaosAddressSelection): boolean {
  return Boolean(selection.provinceId && selection.districtId);
}

export function formatLaosAddress(selection: LaosAddressSelection): string {
  if (!isLaosAddressComplete(selection)) {
    return "";
  }

  const province = getProvinceById(selection.provinceId);
  const district = getDistrictById(selection.districtId);
  const districtLabel = district?.nameLo ?? "";
  const provinceLabel = province?.nameLo ?? "";

  const parts = [
    selection.detail.trim(),
    districtLabel ? `ເມືອງ ${districtLabel}` : "",
    provinceLabel ? `ແຂວງ ${provinceLabel}` : "",
  ].filter((value) => value.length > 0);

  return parts.join(", ");
}
