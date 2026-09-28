import { slugifyCity } from '@/lib/jobs/city-slug';
import { provinceSlug } from '@/lib/provinces';
import { categorySlug, type Category } from '@/lib/taxonomy/categories';

/** One place for every landing-page URL, so pages, the sitemap and cross-links agree. */
export const paths = {
  city: (city: string) => `/browse/${slugifyCity(city)}`,
  cityDiscipline: (city: string, category: Category) => `/browse/${slugifyCity(city)}/${categorySlug(category)}`,
  province: (code: string) => `/province/${provinceSlug(code)}`,
  provinceDiscipline: (code: string, category: Category) => `/province/${provinceSlug(code)}/${categorySlug(category)}`,
  roles: () => '/roles',
  role: (role: string) => `/roles/${role}`,
  roleProvince: (role: string, code: string) => `/roles/${role}/${provinceSlug(code)}`,
  employers: () => '/employers',
  employer: (employerSlug: string) => `/employers/${employerSlug}`,
  salaries: () => '/salary',
  salary: (role: string) => `/salary/${role}`,
};
