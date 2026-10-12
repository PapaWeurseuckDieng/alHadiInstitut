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
}

// Messages contenant une valeur variable : [expression, remplacement]
export const SERVER_PATTERNS_AR = [
  [/^Élève inscrit pour l’année scolaire (.+)\.$/, 'تم تسجيل التلميذ للسنة الدراسية $1.'],
  [/^Élève inscrit\.?$/, 'تم تسجيل التلميذ.'],
]
