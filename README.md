# Birthday Card

Dashboard web ringan untuk kalender ulang tahun karyawan, generate kartu ucapan, dan membuka link WhatsApp.

Data karyawan default otomatis dimuat dari Google Sheet yang sudah dipublish sebagai CSV.

## Cara Jalan

1. Buka folder `birthday_card`.
2. Jalankan server lokal:

   ```powershell
   node server.mjs
   ```

3. Buka `http://localhost:8088`.

## Data Karyawan

Data karyawan otomatis dimuat dari Google Sheet publish link yang sudah diset di `app.js`.

Kolom minimal:

```csv
name,birth_date,wa,photo_url
Andi Pratama,1992-09-22,081234567890,https://example.com/foto/andi.jpg
```

Alias kolom yang juga dibaca:

- `nama`, `employee`, `karyawan`
- `tanggal_lahir`, `tgl_lahir`, `dob`, `birthday`
- `whatsapp`, `no_wa`, `phone`, `nomor_wa`
- `foto`, `photo`, `image`

## Catatan

- Template card bisa di-upload dari panel kanan dan bisa diganti sewaktu-waktu. Tombol `Reset` mengembalikan ke template bawaan.
- Foto karyawan dimuat dari `photo_url` atau `photolink` di spreadsheet.
- Saat klik `Buat Kartu Ucapan`, aplikasi membuat preview terlebih dulu. Foto dari link akan dibuka lewat proxy lokal saat tersedia, diproses hapus background sederhana, lalu ditempel ke template.
- Hapus background di versi ringan ini paling cocok untuk foto dengan background polos. Untuk hasil rapi pada semua jenis foto, nanti bisa diganti dengan backend/API background removal khusus.
- WhatsApp dibuka per kartu dari preview. Setelah klik `Buka WA`, paste card dengan `Ctrl+V` di WhatsApp.
