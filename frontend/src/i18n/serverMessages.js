/**
 * Traduction en arabe des messages renvoyés par le backend Laravel (en français).
 *
 * Le backend ne gère que le français pour l'instant. Ces tables couvrent les
 * messages connus (backend/app/Http/...). Si le backend est un jour traduit
 * (il reçoit déjà l'en-tête Accept-Language), les messages arabes reçus sont
 * affichés tels quels et ces tables ne servent plus.
 */

// Messages exacts -> arabe
export const SERVER_MESSAGES_AR = {
  // Connexion
  'Numéro de téléphone ou mot de passe incorrect.': 'رقم الهاتف أو كلمة المرور غير صحيحة.',
  'Ce compte est désactivé. Veuillez contacter l\'administration.': 'هذا الحساب معطّل. يرجى التواصل مع الإدارة.',
  'Les élèves ne disposent pas de compte de connexion.': 'لا يملك التلاميذ حسابات دخول.',
  'Trop de tentatives de connexion. Réessayez dans une minute.': 'محاولات دخول كثيرة. أعيدوا المحاولة بعد دقيقة.',
  // Session et droits
  'Non authentifié.': 'انتهت صلاحية الجلسة. يرجى تسجيل الدخول من جديد.',
  'Action non autorisée.': 'غير مسموح لكم بهذا الإجراء.',
  'La ressource demandée est introuvable.': 'المورد المطلوب غير موجود.',
  'Trop de tentatives. Veuillez réessayer plus tard.': 'محاولات كثيرة. يرجى إعادة المحاولة لاحقًا.',
  'Ce compte est désactivé ou archivé. Veuillez contacter l’administration.': 'هذا الحساب معطّل أو مؤرشف. يرجى التواصل مع الإدارة.',
  'Le changement de mot de passe est obligatoire.': 'يجب تغيير كلمة المرور.',
  'Jeton de changement de mot de passe invalide.': 'انتهت صلاحية جلسة تغيير كلمة المرور. سجّلوا الدخول من جديد.',
  'La confirmation du mot de passe ne correspond pas.': 'تأكيد كلمة المرور غير مطابق.',
  // Créations
  'Compte créé.': 'تم إنشاء الحساب.',
  'Classe créée et élèves affectés.': 'تم إنشاء الحلقة وتوزيع التلاميذ.',
  'Classe créée.': 'تم إنشاء الحلقة.',
  // Photos et mots de passe
  'Photo enregistrée.': 'تم حفظ الصورة.',
  'Mot de passe réinitialisé. L’utilisateur se connectera avec le mot de passe temporaire et devra le changer.': 'تمت إعادة تعيين كلمة المرور. سيدخل المستخدم بكلمة المرور المؤقتة ويجب عليه تغييرها.',
  'Vous ne pouvez pas réinitialiser votre propre mot de passe.': 'لا يمكنكم إعادة تعيين كلمة مروركم بأنفسكم.',
  'Ce compte est archivé : son mot de passe ne peut pas être réinitialisé.': 'هذا الحساب مؤرشف: لا يمكن إعادة تعيين كلمة مروره.',
  'La photo doit être une image.': 'يجب أن تكون الصورة ملف صورة.',
  'La photo doit être au format JPG, PNG ou WEBP.': 'يجب أن تكون الصورة بصيغة JPG أو PNG أو WEBP.',
  'La photo ne doit pas dépasser 2 Mo.': 'يجب ألا يتجاوز حجم الصورة 2 ميغابايت.',
  // Dépenses
  'Dépense enregistrée. Elle doit être validée pour compter dans les totaux.': 'تم تسجيل المصروف. يجب اعتماده ليُحتسب في المجاميع.',
  'Dépense modifiée.': 'تم تعديل المصروف.',
  'Dépense validée.': 'تم اعتماد المصروف.',
  'Dépense rejetée.': 'تم رفض المصروف.',
  'Seule une dépense en attente peut être modifiée.': 'لا يمكن تعديل إلا المصروف الذي في الانتظار.',
  'Cette dépense a déjà été traitée.': 'تمت معالجة هذا المصروف من قبل.',
  // Détail, modification, archivage
  'Fiche élève modifiée.': 'تم تعديل ملف التلميذ.',
  'Élève archivé.': 'تمت أرشفة التلميذ.',
  'Compte modifié.': 'تم تعديل الحساب.',
  'Compte archivé.': 'تمت أرشفة الحساب.',
  'Classe modifiée.': 'تم تعديل الحلقة.',
  'Vous ne pouvez pas archiver votre propre compte.': 'لا يمكنكم أرشفة حسابكم.',
  'Une inscription existe déjà pour cet élève pendant l’année scolaire courante.': 'يوجد تسجيل لهذا التلميذ في السنة الدراسية الحالية.',
  'L’élève est introuvable ou archivé.': 'التلميذ غير موجود أو مؤرشف.',
  'Le numéro de téléphone existe déjà.': 'رقم الهاتف مستعمل من قبل.',
  'Tuteur rattaché.': 'تم ربط وليّ الأمر.',
  'Tuteur créé et rattaché. Mot de passe temporaire : passer.': 'تم إنشاء وليّ الأمر وربطه. كلمة المرور المؤقتة: passer.',
  'Rattachement modifié.': 'تم تعديل الربط.',
  'Tuteur retiré de cet élève.': 'تمت إزالة وليّ الأمر من هذا التلميذ.',
  'Un élève doit garder au moins un tuteur.': 'يجب أن يبقى للتلميذ وليّ أمر واحد على الأقل.',
  'Ce tuteur est déjà rattaché à cet élève.': 'وليّ الأمر هذا مرتبط بالتلميذ من قبل.',
  'Ce numéro a déjà un compte : choisissez « Tuteur existant ».': 'لهذا الرقم حساب من قبل: اختاروا «حساب موجود».',
  'L’élève est déjà dans cette classe.': 'التلميذ في هذه الحلقة من قبل.',
  // Espace pédagogique
  'Présences enregistrées.': 'تم حفظ الحضور.',
  'Séance ajoutée au planning hebdomadaire.': 'تمت إضافة الحصة إلى الجدول الأسبوعي.',
  'Séance mise à jour.': 'تم تحديث الحصة.',
  'Fiche hebdomadaire créée en brouillon.': 'تم إنشاء البطاقة الأسبوعية كمسودة.',
  'Fiche hebdomadaire mise à jour.': 'تم تحديث البطاقة الأسبوعية.',
  'Repères coraniques enregistrés.': 'تم حفظ معالم الحفظ.',
  'Fiche hebdomadaire validée.': 'تم اعتماد البطاقة الأسبوعية.',
  'Évaluation d’exemplarité enregistrée.': 'تم حفظ تقييم السلوك.',
  'La date ne correspond pas au jour prévu pour cette séance.': 'التاريخ لا يوافق يوم هذه الحصة.',
  'Une fiche existe déjà pour cet élève et cette semaine.': 'توجد بطاقة لهذا التلميذ في هذا الأسبوع.',
  'Une fiche doit couvrir les jours de cours, du samedi au mercredi.': 'يجب أن تغطي البطاقة أيام الدراسة من السبت إلى الأربعاء.',
  'Le verset dépasse le nombre de versets de la sourate choisie.': 'رقم الآية يتجاوز عدد آيات السورة المختارة.',
  'La fin du repère doit suivre son début dans le Coran.': 'يجب أن تأتي نهاية المقطع بعد بدايته في المصحف.',
  'Fiche validée : seule l’administration peut autoriser sa modification.': 'البطاقة مصادق عليها: لا يسمح بتعديلها إلا الإدارة.',
  'Enregistrez au moins un jour avant de valider la fiche.': 'احفظوا يومًا واحدًا على الأقل قبل المصادقة على البطاقة.',
  'Demande de modification envoyée à l’administration.': 'أُرسل طلب التعديل إلى الإدارة.',
  'Modification autorisée : l’oustaz peut de nouveau modifier cette fiche.': 'تم السماح بالتعديل: يمكن للأستاذ تعديل هذه البطاقة من جديد.',
  'Seule une fiche validée peut faire l’objet d’une demande de modification.': 'لا يمكن طلب تعديل إلا لبطاقة مصادق عليها.',
  'Une demande de modification est déjà en attente pour cette fiche.': 'يوجد طلب تعديل قيد الانتظار لهذه البطاقة.',
  'Seule une fiche validée peut être rouverte.': 'لا يمكن إعادة فتح إلا بطاقة مصادق عليها.',
  'Cette fiche ne vous est pas affectée.': 'هذه البطاقة غير مسندة إليكم.',
  // Frais d'inscription, reçus et diplômes
  'Frais d’inscription encaissés.': 'تم تحصيل رسوم التسجيل.',
  'Les frais d’inscription de cette année sont déjà réglés.': 'رسوم التسجيل لهذه السنة مدفوعة.',
  'Affectez d’abord l’élève à une classe : le montant des frais dépend de la classe.': 'أسندوا التلميذ إلى فصل أولًا: مبلغ الرسوم يتوقف على الفصل.',
  'Aucun frais d’inscription n’est fixé pour cette classe.': 'لم تُحدد رسوم تسجيل لهذا الفصل.',
  'Le montant des frais d’inscription est fixé par classe : indiquez seulement s’ils sont payés.': 'مبلغ رسوم التسجيل محدد لكل فصل: اذكروا فقط إن كانت مدفوعة.',
  'Aucun reçu : les frais d’inscription ne sont pas encore réglés.': 'لا يوجد وصل: رسوم التسجيل غير مدفوعة بعد.',
  'Ce reçu ne concerne pas vos enfants.': 'هذا الوصل لا يخص أبناءكم.',
  'Ce diplôme ne concerne pas vos enfants.': 'هذه الشهادة لا تخص أبناءكم.',
  'Diplôme délivré.': 'تم منح الشهادة.',
  'Diplôme modifié.': 'تم تعديل الشهادة.',
  'Diplôme annulé.': 'تم إلغاء الشهادة.',
  'Un diplôme annulé ne peut plus être modifié.': 'لا يمكن تعديل شهادة ملغاة.',
  'Ce diplôme est déjà annulé.': 'هذه الشهادة ملغاة مسبقًا.',
  'Choisissez le type de diplôme.': 'اختاروا نوع الشهادة.',
  'Indiquez la date d’obtention.': 'أدخلوا تاريخ الحصول.',
  'La date d’obtention ne peut pas être dans le futur.': 'لا يمكن أن يكون تاريخ الحصول في المستقبل.',
  // Paiement à l'inscription
  'Indiquez les frais d’inscription ou au moins une mensualité.': 'أدخلوا رسوم التسجيل أو شهرًا واحدًا على الأقل.',
  'Cet élève ne doit pas la mensualité de ce mois.': 'هذا التلميذ غير مطالب برسوم هذا الشهر.',
  'Cette mensualité est déjà entièrement réglée.': 'رسوم هذا الشهر مدفوعة بالكامل.',
}

// Messages contenant une valeur variable : [expression, remplacement]
export const SERVER_PATTERNS_AR = [
  [/^Élève inscrit pour l’année scolaire (.+)\.$/, 'تم تسجيل التلميذ للسنة الدراسية $1.'],
  [/^Élève inscrit\.?$/, 'تم تسجيل التلميذ.'],
  [/^Élève transféré dans la classe (.+)\.$/, 'تم نقل التلميذ إلى حلقة $1.'],
  [/^Réinscription créée pour l’année scolaire (.+)\.$/, 'تمت إعادة التسجيل للسنة الدراسية $1.'],
]
