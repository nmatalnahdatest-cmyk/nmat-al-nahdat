# Nmat Al Nahdat — সম্পূর্ণ আপডেটের নির্দেশনা

## ১. প্রথমে ব্যাকআপ

বর্তমান লাইভ ওয়েবসাইটে Settings > Export Backup JSON দিয়ে ব্যাকআপ নিন। বর্তমান GitHub repository-এর একটি ZIP-ও রেখে দিন। নতুন কোড GitHub-এর একই repository এবং একই সাইট ঠিকানায় আপলোড করবেন।

## ২. Supabase আপডেট (গুরুত্বপূর্ণ)

আপনার পুরোনো সাইট ইতিমধ্যে Supabase-এ সংযুক্ত। নতুন role permissions ও private documents-এর জন্য:

1. আপনার Supabase প্রকল্প খুলুন।
2. SQL Editor > New query খুলুন।
3. ZIP-এর `supabase/upgrade_workspace.sql` ফাইলটি খুলে পুরো লেখা কপি করে SQL Editor-এ দিন।
4. Run চাপুন। সফল হওয়ার পর নতুন কোড আপলোড করে আবার লগইন করুন।

পুরোনো app_data ও কর্মীদের হিসাব এই স্ক্রিপ্টে মুছে ফেলা হয় না। ব্যক্তিগত ডকুমেন্টের জন্য `worker-documents` নামের একটি private bucket তৈরি হবে। বিদ্যমান কর্মী/পেমেন্ট রেকর্ড একই JSON data keys-এ থাকবে।

শুধু একেবারে নতুন Supabase প্রকল্প হলে প্রথমে `supabase/schema.sql`, তারপর `supabase/upgrade_workspace.sql` চালাবেন। আপডেটের পরে পুরোনো schema.sql আবার চালাবেন না: পুরোনো policy ফিরিয়ে আনতে পারে।

SQL না চালালেও মালিকের নিজের পুরোনো ডেটা, প্রোফাইল, Opening Balance, WhatsApp drafts ও in-app reminders কাজ করার জন্য fallback আছে। Shared access ও নতুন document upload তখন চালু হবে না।

## ৩. GitHub-এ ফাইল আপলোড

ZIP extract করুন। ভেতরের `nmat-al-nahdat-main` ফোল্ডারের সংশোধিত `index.html`, `assets` ও `supabase` আপনার বর্তমান repository-এর root-এ একই অবস্থানে আপলোড করুন। ফোল্ডারটির ভেতরে আবার আরেকটি nmat-al-nahdat-main ফোল্ডার বানাবেন না। Commit করার পর GitHub Pages deployment শেষ হলে Ctrl+F5 চাপুন।

## ৪. কর্মীদের তালিকা

- Company Workers: আগের workerType-বিহীন কর্মীরা কোম্পানির কর্মী হিসেবে থাকবে। নাম, ইকামা বা ফোন দিয়ে খুঁজুন।
- Domestic Workers: নাম, ID/ইকামা নম্বর, ফোন, পেশা ও ইকামার মেয়াদ দিন। কোম্পানি দেওয়া লাগবে না। ডিফল্ট ফি 300 SAR, প্রয়োজন হলে পরিবর্তনযোগ্য।
- Edit profile-এর Worker Type দিয়ে আগের কর্মীকে Domestic-এ পরিবর্তন করা যাবে। আগের পেমেন্টের workerType থাকলে সেই ঐতিহাসিক ধরন বজায় থাকবে।

## ৫. পূর্ণ প্রোফাইল ও পেমেন্ট

Worker Search-এ ইকামা দিয়ে Search চাপুন। exact match হলে সরাসরি পূর্ণ প্রোফাইল খুলবে। নাম, ফোন বা আংশিক ইকামা দিয়েও তালিকা পাওয়া যাবে। ওপরের সার্চ বক্সেও ইকামা লিখে Enter দিতে পারেন।

প্রোফাইলে ব্যক্তিগত তথ্য, ভিসা, পুরোনো বকেয়া, মাসিক হিসাব, মোট জমা ও অবশিষ্ট টাকা থাকবে। Print Statement দিয়ে প্রিন্ট বা ব্রাউজারের Save as PDF ব্যবহার করুন।

Domestic Payments আলাদা মাসিক তালিকা। Generate Current Month দিয়ে সক্রিয় ডোমেস্টিক কর্মীর জন্য মাসিক পাওনা তৈরি করুন। একই মাস আবার generate করলে নতুন duplicate পাওনা তৈরি হবে না। Record Payment-এর Paid Amount-এ এবার যত টাকা পেয়েছেন সেটুকু দিন; আগে জমা দেওয়া টাকার সঙ্গে যোগ হবে। আগের মাসের সারির Pay বাটনে সেই মাস নির্বাচন হবে।

Saved monthly records এবং Opening Balance-ই মোট হিসাবে যুক্ত হবে। যেসব মাসের তথ্য দেওয়া হয়নি, সেসব মাসের পাওনা অনুমান করা হবে না। পুরোনো unpaid obligation ও পরবর্তী payment আলাদা row হলে একই মাসের expected fee একবার এবং paid amounts যোগ করে প্রোফাইলের হিসাব তৈরি হয়। ভুল duplicate paid transaction থাকলে নিজে যাচাই করতে হবে; স্বয়ংক্রিয়ভাবে paid record বাদ দেওয়া হয় না। অতিরিক্ত জমা আলাদা দেখাবে, অন্য মাসে স্বয়ংক্রিয় সমন্বয় করবে না।

নতুন partial payment-এর প্রতিটি জমার amount/date/method/reference সংরক্ষিত হবে। আগের সফটওয়্যারে শুধু cumulative amount থাকলে সেই পুরোনো total-ই আগের জমা হিসেবে থাকবে; হারানো transaction detail পুনরুদ্ধার হবে না।

## ৬. Opening Balance — আগের বকেয়া

প্রোফাইলের Set opening balance চাপুন। পুরোনো মোট বকেয়া, হিসাবের তারিখ এবং কোন সময়ের বকেয়া তার নোট দিন। শুধু এমন বকেয়া দিন যা মাসিক তালিকায় আগে থেকে নেই। একই বকেয়া দুই জায়গায় দিলে হিসাব দ্বিগুণ হবে।

Pay old balance দিয়ে আগের বকেয়ার টাকা জমা দিন। আংশিক জমা দেওয়া যাবে। পরিমাণ/তারিখ/মাধ্যম/রেফারেন্স থাকবে। জমা দেওয়া টাকার চেয়ে Opening Balance কম করে সংরক্ষণ করা যাবে না। এই পুরোনো হিসাব lifetime প্রোফাইল ও statement-এ থাকবে; চলতি মাসের dashboard আলাদা monthly metrics দেখাবে।

## ৭. ইকামা ও এক্সিট রি-এন্ট্রি রিমাইন্ডার

কর্মীর সারির airplane বাটন বা প্রোফাইলের Update visa দিয়ে Visa Number, Issue Date, Return By ও status দিন। ফিরে এলে Returned নির্বাচন করুন।

Reminders মেনু এবং ওপরের bell-এ মেয়াদোত্তীর্ণ ও আগামী 60 দিনের ইকামা/ভিসা ফেরার শেষ তারিখ দেখা যাবে। 7/30/60 দিন এবং Overdue ফিল্টার আছে। Archived, Inactive, Transferred ও Final Exit কর্মীদের reminder বাদ থাকবে। Returned/Cancelled ভিসার পুরোনো return date reminder হবে না।

এগুলো ওয়েবসাইট খোলা বা পেজ বদলানোর সময় হালনাগাদ হওয়া in-app reminder। সাইট বন্ধ থাকলে background SMS, WhatsApp, email বা push notification পাঠাবে না।

## ৮. ব্যক্তিগত ডকুমেন্ট

প্রোফাইলের Private Documents থেকে ইকামা, পাসপোর্ট, ভিসা বা Other বাছাই করে upload করুন। PDF/JPG/PNG/WebP গ্রহণ করে; প্রতি ফাইল সর্বোচ্চ 10 MB।

Bucket private এবং workspace permission দ্বারা সুরক্ষিত। Open চাপলে 60 সেকেন্ডের মেয়াদের একটি private link পাবেন। Archive করলে ফাইল মুছবে না; Restore করা যাবে। JSON backup-এ শুধু file references থাকে, actual document bytes নয়। মূল document-এর আলাদা কপিও নিজের কাছে রাখুন।

ইন্টারনেট সমস্যায় file upload সফল কিন্তু record save ব্যর্থ হলে একটি unlinked file bucket-এ থেকে যেতে পারে। error দেখলে Supabase Storage ও কর্মীর প্রোফাইল যাচাই করে তারপর পুনরায় চেষ্টা করুন।

## ৯. WhatsApp খসড়া

প্রোফাইল > Prepare message থেকে বকেয়া, ইকামার মেয়াদ বা ভিসার ফেরার তারিখের বার্তা বাংলা/English/Arabic-তে তৈরি করুন। লেখাটি পরিবর্তনযোগ্য। Copy draft বা Open WhatsApp ব্যবহার করুন।

ওয়েবসাইট নিজে Send করে না। WhatsApp-এ গিয়ে যাচাই করে নিজে Send চাপবেন। Saudi নম্বর 05xxxxxxxx হলে 966-এ রূপান্তর করে। অন্য দেশের নম্বর country code-সহ দিন। ভুল নম্বর হলে কেবল Copy draft ব্যবহার করা যাবে।

## ১০. Owner / Editor / Viewer

- Owner: নিজের workspace-এর সব ডেটা ও অন্যদের অনুমতি পরিচালনা করবেন।
- Editor: worker, payment, old balance, visa ও document-এর তথ্য পরিবর্তন করতে পারবেন।
- Viewer: তথ্য পড়া, document দেখা, statement/backup export ও draft প্রস্তুত করতে পারবেন; হিসাব পরিবর্তন করতে পারবেন না।

মালিক ছাড়া আরেকজনকে দিতে চাইলে আগে Supabase Authentication > Users থেকে তার account তৈরি/Invite করুন। সেই ব্যক্তি নিজের sign-in সম্পন্ন করবেন। এরপর মালিক নিজের workspace-এর Settings > Workspace & Access-এ তার একই email দিন এবং Viewer বা Editor বেছে Save access চাপুন। কাউকে নিজের account password দেবেন না।

শেয়ার পাওয়া ব্যক্তি নিজের account দিয়ে লগইন করলে shared workspace বেছে নিতে পারবেন। Settings-এর Current workspace দিয়ে নিজের ও shared workspace বদলানো যাবে। শুধু Owner-ই access grant/revoke করতে পারবেন। Revoke নতুন server access বন্ধ করবে; আগে দেখা বা export করা তথ্য ফেরত নেওয়া যায় না।

ডেটাবেস RLS ও storage policies-ও এই অনুমতি প্রয়োগ করে; শুধু UI বাটন বন্ধ করা নয়। Shared users এখনো পুরো workspace-এর ডেটা পড়েন, worker-by-worker permission নয়।

## পরীক্ষা ও সীমা

JavaScript syntax, পূর্ণ প্রোফাইল, legacy হিসাব, opening balance ও payment, readonly guard, reminder dates/status, WhatsApp draft/phone validation, document upload/link/archive এবং workspace cache isolation নমুনা ডেটা ও mocked service দিয়ে পরীক্ষা করা হয়েছে। পরীক্ষার কোড tests/ ফোল্ডারে আছে।

বাস্তব Supabase-এ upgrade SQL এখনো চালানো হয়নি এবং প্রকৃত user accounts/documents দিয়ে integration পরীক্ষা করা হয়নি। Browser preview এই কাজের পরিবেশ থেকে চালানো যায়নি; desktop/mobile visual layout live deployment-এর পরে যাচাই করুন।

বর্তমান app JSON records সংরক্ষণ করে; একাধিক editor একই সময়ে একই তালিকা save করলে সর্বশেষ save আগের পরিবর্তন overwrite করতে পারে। একসঙ্গে একই worker/payment তালিকা edit করা এড়িয়ে চলুন, পরিবর্তনের আগে page reload করুন এবং নিয়মিত backup নিন।

এই ZIP আপনার live GitHub ওয়েবসাইটে স্বয়ংক্রিয়ভাবে প্রকাশ করা হয়নি।
