import type { Product } from "./types";

/**
 * Προϊόν για κάρτα / μενού / καλάθι: χωρίς ό,τι δείχνει μόνο η σελίδα προϊόντος (περιγραφή, banners, ενότητες, βίντεο,
 * κριτικές, ερωτήσεις). Αυτά ταξίδευαν στον browser με κάθε σελίδα (≈90 KB μόνο από το mega menu) χωρίς να φαίνονται πουθενά.
 * Τα specs / attrs μένουν: τα θέλουν η σύγκριση, η λίστα σε γραμμές και το «χωράει;».
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const cardProduct = ({ description, banners, sections, videos, reviews, questions, ...p }: Product): Product => p;
